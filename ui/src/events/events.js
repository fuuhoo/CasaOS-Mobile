/*
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-07-14 11:17:17
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2023-03-14 14:28:53
 * @FilePath: \CasaOS-UI-0.4.2\src\events\events.js
 * @Description: 
 * 
 * Copyright (c) 2022 by IceWhale, All Rights Reserved. 
 */
const events = {
	// Event: 'eventName',
	SHOW_CHANGE_WALLPAPER_MODAL: 'showChangeWallpaperModal',
	OPEN_APP_STORE_AND_GOTO_SYNCTHING: 'openAppStoreAndGotoSyncing',
	RELOAD_FILE_LIST: 'reloadFileList',
	SHOW_HOME_CONTEXT_MENU: 'showHomeContextMenu',
	RELOAD_APP_LIST: 'reloadAppList',
	UPDATE_SYNC_STATUS: 'updateSyncStatus',
	UN_SHARE: 'unShare',
	GOTO: 'goto',
	SELECT_SHARE: 'selectShare',
	RELOAD_MOUNT_LIST: 'reloadMountList',
	SHOW_MERGER_PANEL: 'showMergerPanel',
	REFRESH_DISKLIST: 'refreshDiskList',
	AFTER_FILES_ENTER: 'afterFilesEnter',
	SHOW_DROP_CONTEXT_MENU: 'showDropContextMenu',
	ACTIVE_DROP_UPLOAD: 'activeDropUpload',
	SHOW_FILES_SIDEBAR: 'showFilesSidebar',
	HIDE_FILES_SIDEBAR: 'hideFilesSidebar',
	// 「返回」请求：文件管理器用它来响应手势返回 / 浏览器后退。
	// 监听方需要调用传入的回调并返回 true 表示「这一下我处理了」。
	FILE_BACK: 'fileBack',
};
export default events;