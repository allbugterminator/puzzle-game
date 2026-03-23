/**
 * GameConfig.ts
 * 游戏配置数据
 */

/** 游戏版本 */
export const GAME_VERSION = '1.0.0';

/** 开发配置 */
export const DEV_CONFIG = {
    DEBUG_MODE: true,
    SHOW_FPS: false,
    LOG_LEVEL: 'debug' as const
};

/** 性能配置 */
export const PERF_CONFIG = {
    TARGET_FPS: 60,
    MAX_DRAW_CALLS: 50,
    MAX_MEMORY_MB: 100,
    OBJECT_POOL_SIZE: 50
};

/** 微信小游戏配置 */
export const WX_CONFIG = {
    APP_ID: '',  // 需要填入实际的AppID
    SUBPACKAGES: [
        { name: 'level_pack_1', root: 'levels/pack1/' },
        { name: 'level_pack_2', root: 'levels/pack2/' },
        { name: 'level_pack_3', root: 'levels/pack3/' },
        { name: 'level_pack_4', root: 'levels/pack4/' }
    ],
    AD_UNITS: {
        banner: '',
        rewardedVideo: ''
    }
};

/** 关卡配置 */
export const LEVEL_CONFIG = {
    TOTAL_LEVELS: 40,
    LEVELS_PER_PACK: 10,
    PACK_COUNT: 4,
    MAX_STARS_PER_LEVEL: 3
};

/** 存档配置 */
export const SAVE_CONFIG = {
    VERSION: '1.0.0',
    AUTO_SAVE_INTERVAL: 60,
    MAX_SAVE_SLOTS: 3,
    CLOUD_SAVE_ENABLED: true
};

/** 音频配置 */
export const AUDIO_CONFIG = {
    SFX_POOL_SIZE: 8,
    MAX_BGM_VOLUME: 1.0,
    MAX_SFX_VOLUME: 1.0,
    FADE_DURATION: 1.0
};

/** UI配置 */
export const UI_CONFIG = {
    TRANSITION_DURATION: 0.3,
    POPUP_ANIMATION: 'scale' as const,
    DEFAULT_LAYER: 'POPUP' as const
};
