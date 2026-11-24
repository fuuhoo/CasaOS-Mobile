<!--
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2023-03-14 18:49:49
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2023-03-14 20:02:59
 * @FilePath: \CasaOS-UI-0.4.2\src\components\filebrowser\components\SidebarMenuButton.vue
 * @Description: 
 * 
 * Copyright (c) 2023 by IceWhale, All Rights Reserved. 
-->
<template>
	<!--
		注意：这里的 id 不能和首页顶栏的 "sidebar-btn" 重复。
		顶栏那个 style 块没有 scoped，ID 选择器全局生效，同名会把本按钮一起隐藏，
		导致宽度 > 480px 时看不到打开存储列表的按钮。
	-->
	<div
		v-if="isMobile"
		id="file-sidebar-btn"
		class="is-flex is-align-items-center mr-3"
		@click="handleShowSideBar"
	>
		<b-icon class="picon" icon="menu"></b-icon>
	</div>
</template>

<script>
import VueBreakpointMixin from "vue-breakpoint-mixin";
import events             from "@/events/events";

export default {
	name: "sidebar-button",
	mixins: [VueBreakpointMixin],
	methods: {
		handleShowSideBar() {
			console.log("handleShowSideBar");
			this.$EventBus.$emit(events.SHOW_FILES_SIDEBAR);
		},
	},
};
</script>


