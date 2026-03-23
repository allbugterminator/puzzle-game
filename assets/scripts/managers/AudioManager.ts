/**
 * AudioManager.ts
 * 音频管理器 - 统一音效和音乐管理
 * 
 * 特性：
 * - BGM和SFX分层管理
 * - 音量控制
 * - 淡入淡出
 * - 3D空间音效
 * - 音效池复用
 * - 静音检测
 */

import { 
    _decorator, 
    AudioClip, 
    AudioSource, 
    Component, 
    director, 
    Node, 
    tween,
    Tween,
    v3,
    Vec3,
    warn 
} from 'cc';
import { Singleton } from '../core/Singleton';
import { EventBus } from '../core/EventBus';

const { ccclass, property } = _decorator;

/** 音频类型 */
export enum AudioType {
    BGM = 'bgm',           // 背景音乐
    SFX = 'sfx',           // 音效
    AMBIENT = 'ambient',   // 环境音
    VOICE = 'voice'        // 语音
}

/** 音频配置 */
export interface AudioConfig {
    bgmVolume: number;      // BGM音量 (0-1)
    sfxVolume: number;      // SFX音量 (0-1)
    ambientVolume: number;  // 环境音量 (0-1)
    voiceVolume: number;    // 语音音量 (0-1)
    masterVolume: number;   // 主音量 (0-1)
    muted: boolean;         // 全局静音
    bgmEnabled: boolean;    // BGM开关
    sfxEnabled: boolean;    // SFX开关
}

/** 音频轨道 */
interface AudioTrack {
    source: AudioSource;
    type: AudioType;
    volume: number;
    tween?: Tween<any>;
}

/** 音效池项 */
interface SFXPoolItem {
    source: AudioSource;
    inUse: boolean;
}

/**
 * 音频管理器
 */
@ccclass('AudioManager')
export class AudioManager extends Singleton<AudioManager> {
    private _config: AudioConfig = {
        bgmVolume: 0.7,
        sfxVolume: 1.0,
        ambientVolume: 0.5,
        voiceVolume: 1.0,
        masterVolume: 1.0,
        muted: false,
        bgmEnabled: true,
        sfxEnabled: true
    };

    /** BGM轨道 */
    private _bgmTrack: AudioTrack | null = null;
    private _bgmNode: Node | null = null;

    /** 环境音轨道 */
    private _ambientTrack: AudioTrack | null = null;
    private _ambientNode: Node | null = null;

    /** 音效池 */
    private _sfxPool: SFXPoolItem[] = [];
    private _sfxPoolSize: number = 8;
    private _sfxNode: Node | null = null;

    /** 当前播放的BGM */
    private _currentBGM: string = '';

    /** 缓存的音频资源 */
    private _audioCache: Map<string, AudioClip> = new Map();

    /** 音频淡入淡出时间(秒) */
    private readonly FADE_DURATION: number = 1.0;

    /** 事件总线 */
    private _eventBus: EventBus;

    /**
     * 初始化
     */
    protected onInitialize(): void {
        this._eventBus = EventBus.getInstance();
        this._initAudioNodes();
        
        console.log('[AudioManager] 初始化完成');
    }

    /**
     * 初始化音频节点
     */
    private _initAudioNodes(): void {
        // BGM节点
        this._bgmNode = new Node('BGM_Node');
        this._bgmNode.parent = director.getScene()?.getChildByName('Canvas') || null;
        const bgmSource = this._bgmNode.addComponent(AudioSource);
        bgmSource.loop = true;
        this._bgmTrack = {
            source: bgmSource,
            type: AudioType.BGM,
            volume: this._config.bgmVolume
        };

        // 环境音节点
        this._ambientNode = new Node('Ambient_Node');
        this._ambientNode.parent = director.getScene()?.getChildByName('Canvas') || null;
        const ambientSource = this._ambientNode.addComponent(AudioSource);
        ambientSource.loop = true;
        this._ambientTrack = {
            source: ambientSource,
            type: AudioType.AMBIENT,
            volume: this._config.ambientVolume
        };

        // SFX节点池
        this._sfxNode = new Node('SFX_Pool');
        this._sfxNode.parent = director.getScene()?.getChildByName('Canvas') || null;
        
        for (let i = 0; i < this._sfxPoolSize; i++) {
            const sfxNode = new Node(`SFX_${i}`);
            sfxNode.parent = this._sfxNode;
            const source = sfxNode.addComponent(AudioSource);
            source.loop = false;
            this._sfxPool.push({
                source,
                inUse: false
            });
        }
    }

    /**
     * 播放BGM
     */
    public async playBGM(
        clip: AudioClip | string, 
        fade: boolean = true,
        fadeDuration: number = this.FADE_DURATION
    ): Promise<void> {
        if (!this._config.bgmEnabled || !this._bgmTrack) return;

        const clipName = typeof clip === 'string' ? clip : clip.name;
        if (this._currentBGM === clipName && this._bgmTrack.source.playing) {
            return;
        }

        let audioClip: AudioClip;
        if (typeof clip === 'string') {
            audioClip = await this._loadAudioClip(clip);
        } else {
            audioClip = clip;
        }

        if (!audioClip) {
            warn(`[AudioManager] BGM加载失败: ${clipName}`);
            return;
        }

        const targetVolume = this._config.bgmVolume * this._config.masterVolume;

        if (fade && this._bgmTrack.source.playing) {
            // 淡出旧BGM
            await this._fadeOutBGM(fadeDuration * 0.5);
        }

        // 设置并播放新BGM
        this._bgmTrack.source.clip = audioClip;
        this._currentBGM = clipName;

        if (fade) {
            this._bgmTrack.source.volume = 0;
            this._bgmTrack.source.play();
            await this._fadeInBGM(targetVolume, fadeDuration * 0.5);
        } else {
            this._bgmTrack.source.volume = targetVolume;
            this._bgmTrack.source.play();
        }
    }

    /**
     * 停止BGM
     */
    public async stopBGM(fade: boolean = true): Promise<void> {
        if (!this._bgmTrack || !this._bgmTrack.source.playing) return;

        if (fade) {
            await this._fadeOutBGM(this.FADE_DURATION);
        }

        this._bgmTrack.source.stop();
        this._currentBGM = '';
    }

    /**
     * 播放音效
     */
    public playSFX(
        clip: AudioClip | string,
        volumeScale: number = 1.0,
        pitch: number = 1.0
    ): void {
        if (!this._config.sfxEnabled) return;

        let audioClip: AudioClip;
        if (typeof clip === 'string') {
            audioClip = this._audioCache.get(clip)!;
            if (!audioClip) {
                // 异步加载并播放
                this._loadAudioClip(clip).then(loaded => {
                    if (loaded) this._playSFXInternal(loaded, volumeScale, pitch);
                });
                return;
            }
        } else {
            audioClip = clip;
        }

        this._playSFXInternal(audioClip, volumeScale, pitch);
    }

    /**
     * 播放SFX内部实现
     */
    private _playSFXInternal(
        clip: AudioClip, 
        volumeScale: number,
        pitch: number
    ): void {
        const poolItem = this._getIdleSFXSource();
        if (!poolItem) {
            warn('[AudioManager] 音效池已满，无法播放');
            return;
        }

        poolItem.inUse = true;
        const source = poolItem.source;

        source.clip = clip;
        source.volume = this._config.sfxVolume * this._config.masterVolume * volumeScale;
        source.pitch = pitch;
        source.play();

        // 播放完成后回收
        const duration = clip.duration * 1000 / pitch;
        setTimeout(() => {
            poolItem.inUse = false;
        }, duration);
    }

    /**
     * 播放环境音
     */
    public async playAmbient(
        clip: AudioClip | string,
        fade: boolean = true
    ): Promise<void> {
        if (!this._ambientTrack) return;

        let audioClip: AudioClip;
        if (typeof clip === 'string') {
            audioClip = await this._loadAudioClip(clip);
        } else {
            audioClip = clip;
        }

        if (!audioClip) return;

        const targetVolume = this._config.ambientVolume * this._config.masterVolume;

        if (fade) {
            await this._fadeOutAmbient(this.FADE_DURATION * 0.5);
        }

        this._ambientTrack.source.clip = audioClip;

        if (fade) {
            this._ambientTrack.source.volume = 0;
            this._ambientTrack.source.play();
            await this._fadeInAmbient(targetVolume, this.FADE_DURATION * 0.5);
        } else {
            this._ambientTrack.source.volume = targetVolume;
            this._ambientTrack.source.play();
        }
    }

    /**
     * 停止环境音
     */
    public async stopAmbient(fade: boolean = true): Promise<void> {
        if (!this._ambientTrack || !this._ambientTrack.source.playing) return;

        if (fade) {
            await this._fadeOutAmbient(this.FADE_DURATION);
        }

        this._ambientTrack.source.stop();
    }

    /**
     * 预加载音频
     */
    public async preload(clipPaths: string[]): Promise<void> {
        const promises = clipPaths.map(async path => {
            const clip = await this._loadAudioClip(path);
            if (clip) {
                this._audioCache.set(path, clip);
            }
        });

        await Promise.all(promises);
        console.log(`[AudioManager] 预加载完成: ${clipPaths.length} 个音频`);
    }

    /**
     * 设置BGM音量
     */
    public setBGMVolume(volume: number): void {
        this._config.bgmVolume = Math.max(0, Math.min(1, volume));
        if (this._bgmTrack) {
            this._bgmTrack.source.volume = this._getFinalVolume(AudioType.BGM);
        }
    }

    /**
     * 设置SFX音量
     */
    public setSFXVolume(volume: number): void {
        this._config.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * 设置主音量
     */
    public setMasterVolume(volume: number): void {
        this._config.masterVolume = Math.max(0, Math.min(1, volume));
        this._updateAllVolumes();
    }

    /**
     * 静音切换
     */
    public toggleMute(): boolean {
        this._config.muted = !this._config.muted;
        this._updateAllVolumes();
        return this._config.muted;
    }

    /**
     * BGM开关
     */
    public toggleBGM(): boolean {
        this._config.bgmEnabled = !this._config.bgmEnabled;
        if (this._config.bgmEnabled) {
            if (this._currentBGM && this._bgmTrack) {
                this._bgmTrack.source.play();
            }
        } else {
            if (this._bgmTrack) {
                this._bgmTrack.source.pause();
            }
        }
        return this._config.bgmEnabled;
    }

    /**
     * SFX开关
     */
    public toggleSFX(): boolean {
        this._config.sfxEnabled = !this._config.sfxEnabled;
        return this._config.sfxEnabled;
    }

    /**
     * 暂停所有音频
     */
    public pauseAll(): void {
        this._bgmTrack?.source.pause();
        this._ambientTrack?.source.pause();
        this._sfxPool.forEach(item => {
            if (item.inUse) {
                item.source.pause();
            }
        });
    }

    /**
     * 恢复所有音频
     */
    public resumeAll(): void {
        if (this._config.bgmEnabled) {
            this._bgmTrack?.source.play();
        }
        this._ambientTrack?.source.play();
        this._sfxPool.forEach(item => {
            if (item.inUse) {
                item.source.play();
            }
        });
    }

    /**
     * 获取空闲的SFX源
     */
    private _getIdleSFXSource(): SFXPoolItem | null {
        // 先找完全空闲的
        for (const item of this._sfxPool) {
            if (!item.inUse) {
                return item;
            }
        }

        // 如果没有，找已播放完的
        for (const item of this._sfxPool) {
            if (!item.source.playing) {
                item.inUse = false;
                return item;
            }
        }

        return null;
    }

    /**
     * 加载音频资源
     */
    private async _loadAudioClip(path: string): Promise<AudioClip | null> {
        // 检查缓存
        if (this._audioCache.has(path)) {
            return this._audioCache.get(path)!;
        }

        return new Promise((resolve) => {
            // TODO: 使用ResLoader加载
            // 这里简化处理，实际项目中应该使用ResLoader
            resolve(null);
        });
    }

    /**
     * 计算最终音量
     */
    private _getFinalVolume(type: AudioType): number {
        if (this._config.muted) return 0;

        let typeVolume = 1;
        switch (type) {
            case AudioType.BGM:
                typeVolume = this._config.bgmVolume;
                break;
            case AudioType.SFX:
                typeVolume = this._config.sfxVolume;
                break;
            case AudioType.AMBIENT:
                typeVolume = this._config.ambientVolume;
                break;
            case AudioType.VOICE:
                typeVolume = this._config.voiceVolume;
                break;
        }

        return typeVolume * this._config.masterVolume;
    }

    /**
     * 更新所有音量
     */
    private _updateAllVolumes(): void {
        if (this._bgmTrack) {
            this._bgmTrack.source.volume = this._getFinalVolume(AudioType.BGM);
        }
        if (this._ambientTrack) {
            this._ambientTrack.source.volume = this._getFinalVolume(AudioType.AMBIENT);
        }
    }

    /**
     * 淡入BGM
     */
    private _fadeInBGM(targetVolume: number, duration: number): Promise<void> {
        return new Promise(resolve => {
            if (!this._bgmTrack) {
                resolve();
                return;
            }

            this._bgmTrack.tween?.stop();
            this._bgmTrack.tween = tween(this._bgmTrack.source)
                .to(duration, { volume: targetVolume })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 淡出BGM
     */
    private _fadeOutBGM(duration: number): Promise<void> {
        return new Promise(resolve => {
            if (!this._bgmTrack) {
                resolve();
                return;
            }

            this._bgmTrack.tween?.stop();
            this._bgmTrack.tween = tween(this._bgmTrack.source)
                .to(duration, { volume: 0 })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 淡入环境音
     */
    private _fadeInAmbient(targetVolume: number, duration: number): Promise<void> {
        return new Promise(resolve => {
            if (!this._ambientTrack) {
                resolve();
                return;
            }

            this._ambientTrack.tween?.stop();
            this._ambientTrack.tween = tween(this._ambientTrack.source)
                .to(duration, { volume: targetVolume })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 淡出环境音
     */
    private _fadeOutAmbient(duration: number): Promise<void> {
        return new Promise(resolve => {
            if (!this._ambientTrack) {
                resolve();
                return;
            }

            this._ambientTrack.tween?.stop();
            this._ambientTrack.tween = tween(this._ambientTrack.source)
                .to(duration, { volume: 0 })
                .call(() => resolve())
                .start();
        });
    }

    /**
     * 销毁
     */
    protected onDestroy(): void {
        this._bgmTrack?.source.destroy();
        this._ambientTrack?.source.destroy();
        this._sfxPool.forEach(item => item.source.destroy());
        this._audioCache.clear();
        
        console.log('[AudioManager] 已销毁');
    }
}
