/**
 * WXAdapter.ts
 * 微信小游戏适配器
 * 
 * 封装微信API，提供统一的跨平台接口
 */

import { log, warn, error } from 'cc';
import { 
    Platform, 
    PlatformType, 
    DeviceInfo, 
    AuthResult, 
    ShareConfig,
    AdConfig,
    VibrateType
} from './Platform';

// 微信API类型声明
declare const wx: any;

/** 微信用户信息 */
export interface WXUserInfo {
    avatarUrl: string;
    city: string;
    country: string;
    gender: number;
    language: string;
    nickName: string;
    province: string;
}

/** 微信登录结果 */
export interface WXLoginResult {
    code: string;
}

/**
 * 微信小游戏适配器
 */
export class WXAdapter extends Platform {
    protected _platformType = PlatformType.WECHAT_GAME;
    private _wx: any = null;

    /**
     * 检查是否运行在微信环境中
     */
    public static isWechat(): boolean {
        return typeof wx !== 'undefined' && wx.getSystemInfoSync;
    }

    /**
     * 检查是否支持云存档
     */
    public static isCloudSaveSupported(): boolean {
        return WXAdapter.isWechat() && wx.setUserCloudStorage;
    }

    /**
     * 初始化
     */
    protected async _doInit(): Promise<void> {
        if (!WXAdapter.isWechat()) {
            throw new Error('非微信环境');
        }

        this._wx = wx;

        // 获取设备信息
        this._deviceInfo = this._getDeviceInfo();

        // 注册生命周期监听
        this._registerLifecycle();

        log('[WXAdapter] 微信适配器初始化完成');
    }

    // ==================== 登录/用户 ====================

    /**
     * 微信登录
     */
    public async login(): Promise<AuthResult> {
        return new Promise((resolve) => {
            this._wx.login({
                success: (res: WXLoginResult) => {
                    resolve({ success: true, data: res });
                },
                fail: (err: any) => {
                    resolve({ success: false, error: err.errMsg });
                }
            });
        });
    }

    /**
     * 获取用户信息
     */
    public async getUserInfo(): Promise<AuthResult> {
        return new Promise((resolve) => {
            this._wx.getUserInfo({
                success: (res: any) => {
                    resolve({ success: true, data: res.userInfo });
                },
                fail: (err: any) => {
                    resolve({ success: false, error: err.errMsg });
                }
            });
        });
    }

    /**
     * 创建用户授权按钮
     */
    public createUserInfoButton(options: any): any {
        return this._wx.createUserInfoButton(options);
    }

    /**
     * 检查是否已授权
     */
    public async checkAuth(scope: string): Promise<boolean> {
        return new Promise((resolve) => {
            this._wx.getSetting({
                success: (res: any) => {
                    resolve(!!res.authSetting[scope]);
                },
                fail: () => {
                    resolve(false);
                }
            });
        });
    }

    /**
     * 请求授权
     */
    public async requestAuth(scope: string): Promise<AuthResult> {
        return new Promise((resolve) => {
            this._wx.authorize({
                scope,
                success: () => {
                    resolve({ success: true });
                },
                fail: (err: any) => {
                    resolve({ success: false, error: err.errMsg });
                }
            });
        });
    }

    // ==================== 分享 ====================

    /**
     * 主动分享
     */
    public async share(config: ShareConfig): Promise<boolean> {
        return new Promise((resolve) => {
            this._wx.shareAppMessage({
                title: config.title,
                imageUrl: config.imageUrl,
                query: config.query,
                success: () => {
                    resolve(true);
                },
                fail: () => {
                    resolve(false);
                }
            });
        });
    }

    /**
     * 分享给好友
     */
    public async shareToFriend(config: ShareConfig): Promise<boolean> {
        return this.share(config);
    }

    /**
     * 注册分享回调
     */
    public onShareAppMessage(callback: () => ShareConfig): void {
        this._wx.onShareAppMessage(callback);
    }

    /**
     * 显示分享菜单
     */
    public showShareMenu(withShareTicket: boolean = false): void {
        this._wx.showShareMenu({
            withShareTicket
        });
    }

    /**
     * 隐藏分享菜单
     */
    public hideShareMenu(): void {
        this._wx.hideShareMenu();
    }

    // ==================== 云存储 ====================

    /**
     * 设置用户云存储
     */
    public async setCloudStorage(data: { key: string; value: string }[]): Promise<boolean> {
        return new Promise((resolve) => {
            this._wx.setUserCloudStorage({
                KVDataList: data,
                success: () => {
                    resolve(true);
                },
                fail: (err: any) => {
                    warn('[WXAdapter] 云存储设置失败', err);
                    resolve(false);
                }
            });
        });
    }

    /**
     * 获取用户云存储
     */
    public async getCloudStorage(keys: string[]): Promise<any> {
        return new Promise((resolve) => {
            this._wx.getUserCloudStorage({
                keyList: keys,
                success: (res: any) => {
                    resolve(res.KVDataList);
                },
                fail: (err: any) => {
                    warn('[WXAdapter] 云存储获取失败', err);
                    resolve(null);
                }
            });
        });
    }

    /**
     * 获取好友云存储
     */
    public async getFriendCloudStorage(keys: string[]): Promise<any[]> {
        return new Promise((resolve) => {
            this._wx.getFriendCloudStorage({
                keyList: keys,
                success: (res: any) => {
                    resolve(res.data);
                },
                fail: (err: any) => {
                    warn('[WXAdapter] 好友云存储获取失败', err);
                    resolve([]);
                }
            });
        });
    }

    /**
     * 移除用户云存储
     */
    public async removeCloudStorage(keys: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            this._wx.removeUserCloudStorage({
                keyList: keys,
                success: () => {
                    resolve(true);
                },
                fail: () => {
                    resolve(false);
                }
            });
        });
    }

    // ==================== 分包加载 ====================

    /**
     * 加载分包
     */
    public async loadSubpackage(name: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const task = this._wx.loadSubpackage({
                name,
                success: (res: any) => {
                    log(`[WXAdapter] 分包 ${name} 加载成功`);
                    resolve(res);
                },
                fail: (err: any) => {
                    error(`[WXAdapter] 分包 ${name} 加载失败`, err);
                    reject(err);
                }
            });

            return task;
        });
    }

    /**
     * 加载分包带进度回调
     */
    public loadSubpackageWithProgress(
        name: string,
        onProgress: (progress: number, totalBytesWritten: number, totalBytesExpectedToWrite: number) => void
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const task = this._wx.loadSubpackage({
                name
            });

            task.onProgressUpdate((res: any) => {
                onProgress(res.progress, res.totalBytesWritten, res.totalBytesExpectedToWrite);
            });

            task.then(resolve).catch(reject);
        });
    }

    // ==================== 广告 ====================

    /**
     * 创建激励视频广告
     */
    public createRewardedVideoAd(config: AdConfig): any {
        return this._wx.createRewardedVideoAd({
            adUnitId: config.adUnitId
        });
    }

    /**
     * 创建Banner广告
     */
    public createBannerAd(config: AdConfig & { style: any }): any {
        return this._wx.createBannerAd({
            adUnitId: config.adUnitId,
            style: config.style
        });
    }

    /**
     * 创建插屏广告
     */
    public createInterstitialAd(config: AdConfig): any {
        return this._wx.createInterstitialAd({
            adUnitId: config.adUnitId
        });
    }

    // ==================== 振动 ====================

    /**
     * 振动反馈
     */
    public vibrate(type: VibrateType): void {
        if (type === VibrateType.LIGHT) {
            this._wx.vibrateShort({ type: 'light' });
        } else if (type === VibrateType.MEDIUM) {
            this._wx.vibrateShort({ type: 'medium' });
        } else {
            this._wx.vibrateShort({ type: 'heavy' });
        }
    }

    /**
     * 短振动
     */
    public vibrateShort(): void {
        this._wx.vibrateShort();
    }

    /**
     * 长振动
     */
    public vibrateLong(): void {
        this._wx.vibrateLong();
    }

    // ==================== 设备信息 ====================

    /**
     * 获取设备信息
     */
    private _getDeviceInfo(): DeviceInfo {
        const info = this._wx.getSystemInfoSync();
        return {
            platform: info.platform,
            model: info.model,
            system: info.system,
            version: info.version,
            brand: info.brand,
            screenWidth: info.screenWidth,
            screenHeight: info.screenHeight,
            windowWidth: info.windowWidth,
            windowHeight: info.windowHeight,
            pixelRatio: info.pixelRatio,
            language: info.language
        };
    }

    /**
     * 获取系统信息（异步）
     */
    public async getSystemInfo(): Promise<DeviceInfo> {
        return new Promise((resolve) => {
            this._wx.getSystemInfo({
                success: (info: any) => {
                    resolve({
                        platform: info.platform,
                        model: info.model,
                        system: info.system,
                        version: info.version,
                        brand: info.brand,
                        screenWidth: info.screenWidth,
                        screenHeight: info.screenHeight,
                        windowWidth: info.windowWidth,
                        windowHeight: info.windowHeight,
                        pixelRatio: info.pixelRatio,
                        language: info.language
                    });
                },
                fail: () => {
                    resolve(this._deviceInfo!);
                }
            });
        });
    }

    /**
     * 获取网络状态
     */
    public async getNetworkType(): Promise<string> {
        return new Promise((resolve) => {
            this._wx.getNetworkType({
                success: (res: any) => {
                    resolve(res.networkType);
                },
                fail: () => {
                    resolve('unknown');
                }
            });
        });
    }

    /**
     * 监听网络状态变化
     */
    public onNetworkStatusChange(callback: (isConnected: boolean, networkType: string) => void): void {
        this._wx.onNetworkStatusChange((res: any) => {
            callback(res.isConnected, res.networkType);
        });
    }

    // ==================== 生命周期 ====================

    /**
     * 注册生命周期监听
     */
    private _registerLifecycle(): void {
        // 已在GameManager中处理
    }

    /**
     * 监听显示
     */
    public onShow(callback: () => void): void {
        this._wx.onShow(callback);
    }

    /**
     * 监听隐藏
     */
    public onHide(callback: () => void): void {
        this._wx.onHide(callback);
    }

    /**
     * 监听内存警告
     */
    public onMemoryWarning(callback: () => void): void {
        this._wx.onMemoryWarning(callback);
    }

    // ==================== 性能 ====================

    /**
     * 获取性能信息
     */
    public getPerformance(): any {
        return this._wx.getPerformance();
    }

    /**
     * 设置帧率
     */
    public setPreferredFramesPerSecond(fps: number): void {
        this._wx.setPreferredFramesPerSecond(fps);
    }

    // ==================== UI ====================

    /**
     * 显示Toast
     */
    public showToast(title: string, icon: string = 'none', duration: number = 2000): void {
        this._wx.showToast({
            title,
            icon,
            duration
        });
    }

    /**
     * 显示加载中
     */
    public showLoading(title: string = '加载中...'): void {
        this._wx.showLoading({
            title,
            mask: true
        });
    }

    /**
     * 隐藏加载中
     */
    public hideLoading(): void {
        this._wx.hideLoading();
    }

    /**
     * 显示模态对话框
     */
    public async showModal(title: string, content: string, options: any = {}): Promise<any> {
        return new Promise((resolve) => {
            this._wx.showModal({
                title,
                content,
                showCancel: options.showCancel ?? true,
                cancelText: options.cancelText ?? '取消',
                confirmText: options.confirmText ?? '确定',
                success: (res: any) => {
                    resolve(res);
                },
                fail: () => {
                    resolve({ confirm: false, cancel: true });
                }
            });
        });
    }

    /**
     * 预览图片
     */
    public previewImage(urls: string[], current: number = 0): void {
        this._wx.previewImage({
            urls,
            current: urls[current]
        });
    }

    // ==================== 开放数据域 ====================

    /**
     * 获取开放数据上下文
     */
    public getOpenDataContext(): any {
        return this._wx.getOpenDataContext();
    }

    /**
     * 向开放数据域发送消息
     */
    public postMessageToOpenData(data: any): void {
        const context = this.getOpenDataContext();
        if (context) {
            context.postMessage(data);
        }
    }

    // ==================== 客服 ====================

    /**
     * 打开客服会话
     */
    public openCustomerService(): void {
        this._wx.openCustomerServiceConversation({
            showMessageCard: true
        });
    }

    // ==================== 订阅消息 ====================

    /**
     * 请求订阅消息
     */
    public async requestSubscribeMessage(tmplIds: string[]): Promise<any> {
        return new Promise((resolve) => {
            this._wx.requestSubscribeMessage({
                tmplId: tmplIds,
                success: (res: any) => {
                    resolve({ success: true, data: res });
                },
                fail: (err: any) => {
                    resolve({ success: false, error: err });
                }
            });
        });
    }

    // ==================== 剪贴板 ====================

    /**
     * 设置剪贴板内容
     */
    public async setClipboardData(data: string): Promise<boolean> {
        return new Promise((resolve) => {
            this._wx.setClipboardData({
                data,
                success: () => {
                    resolve(true);
                },
                fail: () => {
                    resolve(false);
                }
            });
        });
    }

    /**
     * 获取剪贴板内容
     */
    public async getClipboardData(): Promise<string> {
        return new Promise((resolve) => {
            this._wx.getClipboardData({
                success: (res: any) => {
                    resolve(res.data);
                },
                fail: () => {
                    resolve('');
                }
            });
        });
    }

    // ==================== 静态方法 ====================

    /**
     * 保存到云端（简化接口）
     */
    public static async saveToCloud(data: any): Promise<boolean> {
        if (!WXAdapter.isCloudSaveSupported()) {
            return false;
        }

        try {
            const adapter = new WXAdapter();
            await adapter.init();
            return await adapter.setCloudStorage([{
                key: 'save_data',
                value: JSON.stringify(data)
            }]);
        } catch {
            return false;
        }
    }

    /**
     * 从云端加载（简化接口）
     */
    public static async loadFromCloud(): Promise<any> {
        if (!WXAdapter.isCloudSaveSupported()) {
            return null;
        }

        try {
            const adapter = new WXAdapter();
            await adapter.init();
            const data = await adapter.getCloudStorage(['save_data']);
            if (data && data.length > 0) {
                return JSON.parse(data[0].value);
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * 加载分包（简化接口）
     */
    public static async loadSubpackage(name: string, onProgress?: (progress: number) => void): Promise<boolean> {
        if (!WXAdapter.isWechat()) {
            return false;
        }

        return new Promise((resolve) => {
            const task = wx.loadSubpackage({
                name,
                success: () => {
                    resolve(true);
                },
                fail: (err: any) => {
                    error(`[WXAdapter] 分包加载失败: ${name}`, err);
                    resolve(false);
                }
            });

            if (onProgress) {
                task.onProgressUpdate((res: any) => {
                    onProgress(res.progress);
                });
            }
        });
    }
}
