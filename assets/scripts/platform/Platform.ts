/**
 * Platform.ts
 * 平台抽象层 - 跨平台接口定义
 * 
 * 提供统一的API接口，隐藏平台差异
 * 支持平台：微信小游戏、Web、原生
 */

import { sys, log, warn } from 'cc';

/** 平台类型 */
export enum PlatformType {
    UNKNOWN = 'unknown',
    WEB = 'web',
    WECHAT_GAME = 'wechat_game',
    ANDROID = 'android',
    IOS = 'ios',
    WINDOWS = 'windows',
    MAC = 'mac'
}

/** 设备信息 */
export interface DeviceInfo {
    platform: string;
    model: string;
    system: string;
    version: string;
    brand: string;
    screenWidth: number;
    screenHeight: number;
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    language: string;
    batteryLevel?: number;
    wifiSignal?: number;
}

/** 用户授权结果 */
export interface AuthResult {
    success: boolean;
    data?: any;
    error?: string;
}

/** 分享配置 */
export interface ShareConfig {
    title: string;
    imageUrl?: string;
    query?: string;
    desc?: string;
}

/** 广告配置 */
export interface AdConfig {
    adUnitId: string;
    adType: 'banner' | 'video' | 'interstitial' | 'rewardedVideo';
}

/** 排行榜数据 */
export interface RankData {
    rank: number;
    avatarUrl: string;
    nickname: string;
    score: number;
    data?: any;
}

/** 震动类型 */
export enum VibrateType {
    LIGHT = 'light',
    MEDIUM = 'medium',
    HEAVY = 'heavy'
}

/**
 * 平台抽象基类
 * 定义跨平台通用接口
 */
export abstract class Platform {
    protected _platformType: PlatformType = PlatformType.UNKNOWN;
    protected _deviceInfo: DeviceInfo | null = null;
    protected _initialized: boolean = false;

    /**
     * 获取平台类型
     */
    public get platformType(): PlatformType {
        return this._platformType;
    }

    /**
     * 初始化
     */
    public async init(): Promise<boolean> {
        if (this._initialized) return true;

        try {
            await this._doInit();
            this._initialized = true;
            log(`[Platform] ${this._platformType} 初始化完成`);
            return true;
        } catch (err) {
            warn(`[Platform] ${this._platformType} 初始化失败`, err);
            return false;
        }
    }

    /**
     * 子类实现初始化
     */
    protected abstract _doInit(): Promise<void>;

    // ==================== 登录/用户 ====================

    /**
     * 登录
     */
    public abstract login(): Promise<AuthResult>;

    /**
     * 获取用户信息
     */
    public abstract getUserInfo(): Promise<AuthResult>;

    /**
     * 检查是否已授权
     */
    public abstract checkAuth(scope: string): Promise<boolean>;

    /**
     * 请求授权
     */
    public abstract requestAuth(scope: string): Promise<AuthResult>;

    // ==================== 社交/分享 ====================

    /**
     * 分享
     */
    public abstract share(config: ShareConfig): Promise<boolean>;

    /**
     * 分享到好友
     */
    public abstract shareToFriend(config: ShareConfig): Promise<boolean>;

    /**
     * 分享到朋友圈/动态
     */
    public abstract shareToTimeline?(config: ShareConfig): Promise<boolean>;

    /**
     * 邀请好友
     */
    public abstract inviteFriend?(config: ShareConfig): Promise<boolean>;

    // ==================== 广告 ====================

    /**
     * 创建激励视频广告
     */
    public abstract createRewardedVideoAd?(config: AdConfig): any;

    /**
     * 创建Banner广告
     */
    public abstract createBannerAd?(config: AdConfig): any;

    /**
     * 创建插屏广告
     */
    public abstract createInterstitialAd?(config: AdConfig): any;

    // ==================== 存储 ====================

    /**
     * 本地存储
     */
    public setStorage(key: string, data: any): boolean {
        try {
            const value = typeof data === 'object' ? JSON.stringify(data) : String(data);
            sys.localStorage.setItem(key, value);
            return true;
        } catch (err) {
            warn('[Platform] 存储失败', err);
            return false;
        }
    }

    /**
     * 本地读取
     */
    public getStorage<T = any>(key: string): T | null {
        try {
            const value = sys.localStorage.getItem(key);
            if (!value) return null;

            try {
                return JSON.parse(value) as T;
            } catch {
                return value as unknown as T;
            }
        } catch (err) {
            warn('[Platform] 读取失败', err);
            return null;
        }
    }

    /**
     * 删除存储
     */
    public removeStorage(key: string): boolean {
        try {
            sys.localStorage.removeItem(key);
            return true;
        } catch (err) {
            warn('[Platform] 删除失败', err);
            return false;
        }
    }

    /**
     * 清空存储
     */
    public clearStorage(): boolean {
        try {
            sys.localStorage.clear();
            return true;
        } catch (err) {
            warn('[Platform] 清空失败', err);
            return false;
        }
    }

    // ==================== 云存储 ====================

    /**
     * 设置云存储
     */
    public abstract setCloudStorage?(data: { key: string; value: string }[]): Promise<boolean>;

    /**
     * 获取云存储
     */
    public abstract getCloudStorage?(keys: string[]): Promise<any>;

    /**
     * 获取好友云存储
     */
    public abstract getFriendCloudStorage?(keys: string[]): Promise<any[]>;

    // ==================== 设备/系统 ====================

    /**
     * 获取设备信息
     */
    public getDeviceInfo(): DeviceInfo | null {
        return this._deviceInfo;
    }

    /**
     * 振动反馈
     */
    public abstract vibrate(type: VibrateType): void;

    /**
     * 短振动
     */
    public abstract vibrateShort?(): void;

    /**
     * 长振动
     */
    public abstract vibrateLong?(): void;

    /**
     * 获取电量
     */
    public abstract getBatteryInfo?(): Promise<{ level: number; isCharging: boolean }>;

    /**
     * 获取网络状态
     */
    public abstract getNetworkType?(): Promise<string>;

    /**
     * 设置屏幕亮度
     */
    public abstract setScreenBrightness?(value: number): Promise<boolean>;

    /**
     * 获取屏幕亮度
     */
    public abstract getScreenBrightness?(): Promise<number>;

    /**
     * 设置保持屏幕常亮
     */
    public abstract setKeepScreenOn?(keepOn: boolean): void;

    // ==================== 分包 ====================

    /**
     * 加载分包
     */
    public abstract loadSubpackage?(name: string): Promise<any>;

    /**
     * 获取分包下载进度
     */
    public abstract onSubpackageProgress?(callback: (progress: number) => void): void;

    // ==================== 生命周期 ====================

    /**
     * 监听显示
     */
    public abstract onShow(callback: () => void): void;

    /**
     * 监听隐藏
     */
    public abstract onHide(callback: () => void): void;

    /**
     * 退出游戏
     */
    public abstract exitGame?(): void;

    // ==================== 性能/调试 ====================

    /**
     * 获取性能信息
     */
    public abstract getPerformance?(): any;

    /**
     * 触发内存警告
     */
    public abstract onMemoryWarning?(callback: () => void): void;

    /**
     * 设置帧率
     */
    public abstract setPreferredFramesPerSecond?(fps: number): void;

    // ==================== 客服/反馈 ====================

    /**
     * 打开客服会话
     */
    public abstract openCustomerService?(): void;

    /**
     * 反馈
     */
    public abstract feedback?(): void;

    // ==================== 订阅消息 ====================

    /**
     * 请求订阅消息
     */
    public abstract requestSubscribeMessage?(tmplIds: string[]): Promise<any>;

    // ==================== 通用工具 ====================

    /**
     * 显示Toast
     */
    public abstract showToast(title: string, icon?: string, duration?: number): void;

    /**
     * 显示加载中
     */
    public abstract showLoading(title?: string): void;

    /**
     * 隐藏加载中
     */
    public abstract hideLoading(): void;

    /**
     * 显示模态对话框
     */
    public abstract showModal(title: string, content: string, options?: any): Promise<any>;

    /**
     * 预览图片
     */
    public abstract previewImage?(urls: string[], current?: number): void;

    /**
     * 保存图片到相册
     */
    public abstract saveImageToPhotosAlbum?(filePath: string): Promise<boolean>;

    /**
     * 获取系统信息
     */
    public abstract getSystemInfo?(): Promise<DeviceInfo>;

    /**
     * 检查能力支持
     */
    public supports(feature: string): boolean {
        return (this as any)[feature] !== undefined;
    }
}

/**
 * 平台管理器
 * 单例管理当前平台实例
 */
export class PlatformManager {
    private static _instance: Platform | null = null;

    public static init(platform: Platform): boolean {
        this._instance = platform;
        return true;
    }

    public static getInstance(): Platform | null {
        return this._instance;
    }

    public static getPlatformType(): PlatformType {
        return this._instance?.platformType || PlatformType.UNKNOWN;
    }

    public static isWechatGame(): boolean {
        return this._instance?.platformType === PlatformType.WECHAT_GAME;
    }

    public static isWeb(): boolean {
        return this._instance?.platformType === PlatformType.WEB;
    }

    public static isMobile(): boolean {
        const type = this._instance?.platformType;
        return type === PlatformType.ANDROID || 
               type === PlatformType.IOS || 
               type === PlatformType.WECHAT_GAME;
    }
}
