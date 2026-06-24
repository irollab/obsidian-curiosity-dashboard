import { type Stage } from '@/domain/stages';

import type { Locale } from './locale';

export type TranslationKey =
  | 'settings.heading'
  | 'settings.topicDir' | 'settings.scriptDir' | 'settings.assetDir' | 'settings.reviewDir'
  | 'settings.topicTemplate' | 'settings.scriptTemplate' | 'settings.reviewTemplate'
  | 'settings.backgroundPath' | 'settings.openOnStartup' | 'settings.defaultTab'
  | 'settings.enableMobileView'
  | 'settings.language' | 'settings.language.auto' | 'settings.language.zh' | 'settings.language.en'
  | 'settings.saveFailed'
  | 'common.unknownError' | 'common.unset' | 'common.cancel' | 'common.create'
  | 'common.mobileReadonlyMode' | 'common.mobileReadonlyCreateFile'
  | 'common.unavailableMobileReadonly' | 'common.unavailableReason' | 'common.unknownReason'
  | 'common.labelPath' | 'common.contextDetail'
  | 'stage.unknown'
  | 'tab.overview' | 'tab.tasks' | 'tab.data' | 'tabs.aria'
  | 'link.topicCard' | 'link.script' | 'link.asset' | 'link.review'
  | 'action.createTopicCard' | 'action.createScript' | 'action.createReview'
  | 'action.openScript' | 'action.openReview'
  | 'overflow.items'
  | 'hero.menuAria' | 'hero.brand' | 'hero.context' | 'hero.kicker' | 'hero.title'
  | 'hero.noFocus' | 'hero.openSettings' | 'hero.multipleTitle' | 'hero.multipleMessage'
  | 'hero.issuePill' | 'hero.currentStageLabel' | 'hero.nextActionLabel' | 'hero.nextActionUnset'
  | 'hero.openScript' | 'hero.viewTopic'
  | 'hero.mobileReadonlyCreateScript' | 'hero.createScriptDisabledAria'
  | 'mission.title' | 'mission.issue' | 'mission.advance'
  | 'mission.invalidStageTitle' | 'mission.terminalStageTitle'
  | 'mission.mobileReadonlyHelp' | 'mission.invalidStageHelp' | 'mission.terminalStageHelp'
  | 'mission.stageTrackAria' | 'mission.tasksTitle' | 'mission.tasksEmpty'
  | 'mission.quickLook' | 'mission.multipleCandidates'
  | 'thisWeek.title' | 'thisWeek.empty'
  | 'queue.title' | 'queue.empty'
  | 'pulse.title' | 'pulse.empty' | 'pulse.sourceButton' | 'pulse.sourceButtonAria'
  | 'pulse.noSource' | 'pulse.commentsTitle' | 'pulse.commentsEmpty' | 'pulse.tableCaption'
  | 'pulse.overflowComments' | 'pulse.overflowRows'
  | 'pulse.col.platform' | 'pulse.col.collectedAt' | 'pulse.col.views' | 'pulse.col.likes'
  | 'pulse.col.favorites' | 'pulse.col.comments' | 'pulse.col.shares'
  | 'quickActions.title' | 'quickActions.readonlyReason'
  | 'dock.ideas' | 'dock.mission' | 'dock.tasks' | 'dock.script' | 'dock.data'
  | 'dock.review' | 'dock.settings' | 'dock.aria'
  | 'dock.reason.mobileCreateTopic' | 'dock.reason.noFocus'
  | 'dock.reason.mobileCreate' | 'dock.reason.notLinked'
  | 'confirmStage.title' | 'confirmStage.terminal' | 'confirmStage.prompt' | 'confirmStage.confirm'
  | 'createFile.issue' | 'createFile.title' | 'createFile.targetPath'
  | 'createFile.errIssue' | 'createFile.errTitleEmpty' | 'createFile.errTitleInvalid'
  | 'createFile.errPathEmpty' | 'createFile.errPathExt'
  | 'modal.createTopicHeading' | 'modal.createScriptHeading' | 'modal.createReviewHeading'
  | 'view.loadingTitle' | 'view.loadingBody' | 'view.errorTitle' | 'view.retry'
  | 'view.mobileDisabledTitle' | 'view.mobileDisabledBody' | 'view.unknownLoadError'
  | 'view.openFileFailed' | 'view.toggleTaskFailed' | 'view.advanceFailed'
  | 'view.notLoadedCreate' | 'view.focusChangedCreate' | 'view.focusChangedCancel'
  | 'view.stateChangedCancel' | 'view.templateMissingOpened' | 'view.templateMissingManual'
  | 'view.createFailed' | 'view.verifyFocusFailed' | 'view.focusChangedNotLinked'
  | 'view.linkFailed' | 'view.openFailedDetail' | 'view.refreshFailedDetail'
  | 'view.partialResult' | 'view.linkedSuffix' | 'view.detailJoin'
  | 'view.saveTabFailed' | 'view.saveAssociationFailed' | 'view.mobileReadonlyModify'
  | 'view.noSettingsEntry' | 'view.openSettingsFailed'
  | 'error.autoRefreshFailed' | 'error.openFailed' | 'error.openOnStartupFailed';

export const TRANSLATIONS: Record<TranslationKey, Record<Locale, string>> = {
  'settings.heading': { zh: 'Curiosity Dashboard', en: 'Curiosity Dashboard' },
  'settings.topicDir': { zh: '选题目录', en: 'Topic directory' },
  'settings.scriptDir': { zh: '脚本目录', en: 'Script directory' },
  'settings.assetDir': { zh: '素材目录', en: 'Asset directory' },
  'settings.reviewDir': { zh: '复盘目录', en: 'Review directory' },
  'settings.topicTemplate': { zh: '选题卡模板', en: 'Topic template' },
  'settings.scriptTemplate': { zh: '脚本模板', en: 'Script template' },
  'settings.reviewTemplate': { zh: '复盘模板', en: 'Review template' },
  'settings.backgroundPath': { zh: '背景图片', en: 'Background image' },
  'settings.openOnStartup': { zh: '启动时打开', en: 'Open on startup' },
  'settings.defaultTab': { zh: '默认标签页', en: 'Default tab' },
  'settings.enableMobileView': { zh: '启用移动端简化视图', en: 'Enable simplified mobile view' },
  'settings.language': { zh: '界面语言', en: 'Language' },
  'settings.language.auto': { zh: '跟随 Obsidian', en: 'Follow Obsidian' },
  'settings.language.zh': { zh: '中文', en: '中文' },
  'settings.language.en': { zh: 'English', en: 'English' },
  'settings.saveFailed': {
    zh: '无法保存 Curiosity Dashboard 设置：{detail}',
    en: 'Failed to save Curiosity Dashboard settings: {detail}',
  },
  'common.unknownError': { zh: '未知错误', en: 'Unknown error' },
  'common.unset': { zh: '未设置', en: 'Not set' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.create': { zh: '创建', en: 'Create' },
  'common.mobileReadonlyMode': { zh: '移动端为只读模式', en: 'Read-only on mobile' },
  'common.mobileReadonlyCreateFile': {
    zh: '移动端只读，不能创建文件', en: 'Read-only on mobile; cannot create files',
  },
  'common.unavailableMobileReadonly': {
    zh: '{label}（不可用：移动端只读）', en: '{label} (unavailable: read-only on mobile)',
  },
  'common.unavailableReason': {
    zh: '{label}（不可用：{reason}）', en: '{label} (unavailable: {reason})',
  },
  'common.unknownReason': { zh: '未知原因', en: 'unknown reason' },
  'common.labelPath': { zh: '{label}：{path}', en: '{label}: {path}' },
  'common.contextDetail': { zh: '{context}：{detail}', en: '{context}: {detail}' },
  'stage.unknown': { zh: '未知阶段', en: 'Unknown stage' },
  'tab.overview': { zh: '概览', en: 'Overview' },
  'tab.tasks': { zh: '任务', en: 'Tasks' },
  'tab.data': { zh: '数据', en: 'Data' },
  'tabs.aria': { zh: '工作台视图', en: 'Dashboard views' },
  'link.topicCard': { zh: '选题卡', en: 'Topic card' },
  'link.script': { zh: '脚本', en: 'Script' },
  'link.asset': { zh: '素材', en: 'Asset' },
  'link.review': { zh: '复盘', en: 'Review' },
  'action.createTopicCard': { zh: '创建选题卡', en: 'Create topic card' },
  'action.createScript': { zh: '创建脚本', en: 'Create script' },
  'action.createReview': { zh: '创建复盘', en: 'Create review' },
  'action.openScript': { zh: '打开脚本', en: 'Open script' },
  'action.openReview': { zh: '打开复盘', en: 'Open review' },
  'overflow.items': { zh: '另有 {count} 项', en: '{count} more' },
  'hero.menuAria': { zh: '内容工作室菜单栏', en: 'Content Studio menu bar' },
  'hero.brand': { zh: '内容工作室', en: 'Content Studio' },
  'hero.context': { zh: '本地 Markdown 工作区', en: 'Local Markdown Workspace' },
  'hero.kicker': { zh: '当前任务', en: 'CURRENT MISSION' },
  'hero.title': { zh: '追逐你的好奇心', en: 'Chase your curiosity' },
  'hero.noFocus': { zh: '尚未设置当前作品。', en: 'No current work set yet.' },
  'hero.openSettings': { zh: '打开插件设置', en: 'Open plugin settings' },
  'hero.multipleTitle': { zh: '检测到多个当前作品', en: 'Multiple current works detected' },
  'hero.multipleMessage': {
    zh: '请只保留一个 homepage_focus: true，然后刷新工作台。',
    en: 'Keep only one homepage_focus: true, then refresh the dashboard.',
  },
  'hero.issuePill': { zh: '第 {issue} 期', en: 'ISSUE {issue}' },
  'hero.currentStageLabel': { zh: '当前阶段', en: 'CURRENT STAGE' },
  'hero.nextActionLabel': { zh: '下一步', en: 'NEXT ACTION' },
  'hero.nextActionUnset': { zh: '下一步未设置', en: 'Next action not set' },
  'hero.openScript': { zh: '打开当前脚本', en: 'Open current script' },
  'hero.viewTopic': { zh: '查看选题卡', en: 'View topic card' },
  'hero.mobileReadonlyCreateScript': {
    zh: '移动端只读，不能创建脚本', en: 'Read-only on mobile; cannot create script',
  },
  'hero.createScriptDisabledAria': {
    zh: '创建脚本（不可用：移动端只读）', en: 'Create script (unavailable: read-only on mobile)',
  },
  'mission.title': { zh: '任务中心', en: 'Mission Control' },
  'mission.issue': { zh: '第 {issue} 期 — {title}', en: 'Issue {issue} — {title}' },
  'mission.advance': { zh: '推进阶段', en: 'Advance stage' },
  'mission.invalidStageTitle': { zh: '当前阶段无效，无法推进', en: 'Current stage is invalid; cannot advance' },
  'mission.terminalStageTitle': { zh: '复盘是终止阶段', en: 'Review is the terminal stage' },
  'mission.mobileReadonlyHelp': {
    zh: '移动端只读：任务、关联路径和阶段推进不可修改。',
    en: 'Read-only on mobile: tasks, association paths, and stage advancement cannot be changed.',
  },
  'mission.invalidStageHelp': {
    zh: '当前阶段无法识别；请修正选题卡中的 stage 后再推进。',
    en: 'Current stage is unrecognized; fix the stage in the topic card before advancing.',
  },
  'mission.terminalStageHelp': {
    zh: '当前已处于复盘终止阶段，无法继续推进。',
    en: 'Already at the terminal Review stage; cannot advance further.',
  },
  'mission.stageTrackAria': { zh: '制作阶段', en: 'Production stages' },
  'mission.tasksTitle': { zh: '本期执行清单', en: "This issue's checklist" },
  'mission.tasksEmpty': { zh: '未找到「本期执行清单」', en: '"This issue\'s checklist" not found' },
  'mission.quickLook': { zh: '快速查看', en: 'Quick Look' },
  'mission.multipleCandidates': {
    zh: '{label}存在多个候选，请选择：', en: 'Multiple {label} candidates; please choose:',
  },
  'thisWeek.title': { zh: '本周', en: 'This Week' },
  'thisWeek.empty': { zh: '本周暂无已设置截止日期的作品。', en: 'No works with a due date this week.' },
  'queue.title': { zh: '制作队列', en: 'Production Queue' },
  'queue.empty': { zh: '暂无后续制作队列。', en: 'No upcoming production queue.' },
  'pulse.title': { zh: '渠道脉搏', en: 'Channel Pulse' },
  'pulse.empty': { zh: '暂无可验证平台数据。', en: 'No verifiable platform data yet.' },
  'pulse.sourceButton': { zh: '数据来源：本地发布复盘', en: 'Source: local publish review' },
  'pulse.sourceButtonAria': {
    zh: '打开本地发布复盘：{path}', en: 'Open local publish review: {path}',
  },
  'pulse.noSource': { zh: '未关联本地发布复盘。', en: 'No linked local publish review.' },
  'pulse.commentsTitle': { zh: '评论区需求', en: 'Comment demands' },
  'pulse.commentsEmpty': { zh: '暂无可验证评论内容', en: 'No verifiable comments yet' },
  'pulse.tableCaption': {
    zh: '本地发布复盘中的平台数据', en: 'Platform data from the local publish review',
  },
  'pulse.overflowComments': { zh: '另有 {count} 条评论', en: '{count} more comments' },
  'pulse.overflowRows': { zh: '另有 {count} 条平台数据', en: '{count} more platform rows' },
  'pulse.col.platform': { zh: '平台', en: 'Platform' },
  'pulse.col.collectedAt': { zh: '采集时间', en: 'Collected at' },
  'pulse.col.views': { zh: '播放/观看', en: 'Views' },
  'pulse.col.likes': { zh: '点赞', en: 'Likes' },
  'pulse.col.favorites': { zh: '收藏', en: 'Favorites' },
  'pulse.col.comments': { zh: '评论', en: 'Comments' },
  'pulse.col.shares': { zh: '分享', en: 'Shares' },
  'quickActions.title': { zh: '快捷操作', en: 'Quick Actions' },
  'quickActions.readonlyReason': {
    zh: '移动端只读：创建操作不可用。', en: 'Read-only on mobile: creation actions unavailable.',
  },
  'dock.ideas': { zh: '灵感', en: 'Ideas' },
  'dock.mission': { zh: '作品', en: 'Mission' },
  'dock.tasks': { zh: '任务', en: 'Tasks' },
  'dock.script': { zh: '脚本', en: 'Script' },
  'dock.data': { zh: '数据', en: 'Data' },
  'dock.review': { zh: '复盘', en: 'Review' },
  'dock.settings': { zh: '设置', en: 'Settings' },
  'dock.aria': { zh: '工作台快捷入口', en: 'Dashboard shortcuts' },
  'dock.reason.mobileCreateTopic': {
    zh: '移动端只读，不能创建选题卡', en: 'Read-only on mobile; cannot create topic card',
  },
  'dock.reason.noFocus': { zh: '未设置当前作品', en: 'No current work set' },
  'dock.reason.mobileCreate': {
    zh: '移动端只读，不能创建{what}', en: 'Read-only on mobile; cannot create {what}',
  },
  'dock.reason.notLinked': { zh: '当前作品未关联{what}', en: 'Current work has no linked {what}' },
  'confirmStage.title': { zh: '推进制作阶段', en: 'Advance production stage' },
  'confirmStage.terminal': { zh: '当前已经是最终阶段。', en: 'Already at the final stage.' },
  'confirmStage.prompt': { zh: '从「{from}」推进到「{to}」？', en: 'Advance from "{from}" to "{to}"?' },
  'confirmStage.confirm': { zh: '推进', en: 'Advance' },
  'createFile.issue': { zh: '期数', en: 'Issue' },
  'createFile.title': { zh: '标题', en: 'Title' },
  'createFile.targetPath': { zh: '目标路径', en: 'Target path' },
  'createFile.errIssue': { zh: '期数必须是正安全整数。', en: 'Issue must be a positive safe integer.' },
  'createFile.errTitleEmpty': { zh: '标题不能为空。', en: 'Title cannot be empty.' },
  'createFile.errTitleInvalid': {
    zh: '标题不能生成有效文件名。', en: 'Title cannot produce a valid filename.',
  },
  'createFile.errPathEmpty': { zh: '目标路径不能为空。', en: 'Target path cannot be empty.' },
  'createFile.errPathExt': { zh: '目标路径必须以 .md 结尾。', en: 'Target path must end with .md.' },
  'modal.createTopicHeading': { zh: '创建选题卡', en: 'Create topic card' },
  'modal.createScriptHeading': { zh: '创建脚本', en: 'Create script' },
  'modal.createReviewHeading': { zh: '创建发布复盘', en: 'Create publish review' },
  'view.loadingTitle': { zh: '正在加载 Curiosity Dashboard', en: 'Loading Curiosity Dashboard' },
  'view.loadingBody': { zh: '正在读取本地 Markdown 数据…', en: 'Reading local Markdown data…' },
  'view.errorTitle': { zh: 'Dashboard 加载失败', en: 'Dashboard failed to load' },
  'view.retry': { zh: '重试', en: 'Retry' },
  'view.mobileDisabledTitle': { zh: '移动端视图已关闭', en: 'Mobile view disabled' },
  'view.mobileDisabledBody': {
    zh: '请在插件设置中启用移动端简化视图。', en: 'Enable simplified mobile view in plugin settings.',
  },
  'view.unknownLoadError': {
    zh: '读取本地数据时发生未知错误，请重试。',
    en: 'An unknown error occurred while reading local data; please retry.',
  },
  'view.openFileFailed': { zh: '无法打开文件', en: 'Unable to open file' },
  'view.toggleTaskFailed': { zh: '无法更新任务', en: 'Unable to update task' },
  'view.advanceFailed': { zh: '无法推进阶段', en: 'Unable to advance stage' },
  'view.notLoadedCreate': {
    zh: 'Dashboard 数据尚未加载，不能创建文件。', en: 'Dashboard data not loaded yet; cannot create files.',
  },
  'view.focusChangedCreate': {
    zh: '当前作品已变化，不能创建关联文件。', en: 'Current work changed; cannot create linked file.',
  },
  'view.focusChangedCancel': {
    zh: '当前作品已变化，已取消创建。', en: 'Current work changed; creation cancelled.',
  },
  'view.stateChangedCancel': {
    zh: 'Dashboard 状态已变化，已取消创建。', en: 'Dashboard state changed; creation cancelled.',
  },
  'view.templateMissingOpened': {
    zh: '创建失败：模板不存在：{path}。已打开插件设置。',
    en: 'Creation failed: template not found: {path}. Opened plugin settings.',
  },
  'view.templateMissingManual': {
    zh: '创建失败：模板缺失且无法自动打开，请手动打开设置：{path}。',
    en: 'Creation failed: template missing and could not auto-open; open settings manually: {path}.',
  },
  'view.createFailed': { zh: '创建失败', en: 'Creation failed' },
  'view.verifyFocusFailed': { zh: '无法核对当前作品：{detail}', en: 'Unable to verify current work: {detail}' },
  'view.focusChangedNotLinked': { zh: '当前作品已变化，文件未关联', en: 'Current work changed; file not linked' },
  'view.linkFailed': { zh: '关联失败：{detail}', en: 'Linking failed: {detail}' },
  'view.openFailedDetail': { zh: '无法打开：{detail}', en: 'Unable to open: {detail}' },
  'view.refreshFailedDetail': { zh: '无法刷新 Dashboard：{detail}', en: 'Unable to refresh Dashboard: {detail}' },
  'view.partialResult': { zh: '文件已创建{suffix}，但{details}', en: 'File created{suffix}, but {details}' },
  'view.linkedSuffix': { zh: '并关联', en: ' and linked' },
  'view.detailJoin': { zh: '；且', en: '; and ' },
  'view.saveTabFailed': { zh: '无法保存当前标签', en: 'Unable to save current tab' },
  'view.saveAssociationFailed': { zh: '无法保存关联路径', en: 'Unable to save association path' },
  'view.mobileReadonlyModify': { zh: '移动端只读，不能修改文件。', en: 'Read-only on mobile; cannot modify files.' },
  'view.noSettingsEntry': {
    zh: '当前 Obsidian 版本未提供设置入口', en: 'This Obsidian version provides no settings entry',
  },
  'view.openSettingsFailed': { zh: '无法打开插件设置', en: 'Unable to open plugin settings' },
  'error.autoRefreshFailed': { zh: 'Dashboard 自动刷新失败', en: 'Dashboard auto-refresh failed' },
  'error.openFailed': { zh: '无法打开 Curiosity Dashboard', en: 'Unable to open Curiosity Dashboard' },
  'error.openOnStartupFailed': {
    zh: '无法在启动时打开 Curiosity Dashboard', en: 'Unable to open Curiosity Dashboard on startup',
  },
};

export const STAGE_LABELS: Record<Locale, Record<Stage, string>> = {
  zh: { 选题: '选题', 策划: '策划', 制作: '制作', 发布: '发布', 复盘: '复盘' },
  en: { 选题: 'Topic', 策划: 'Plan', 制作: 'Produce', 发布: 'Publish', 复盘: 'Review' },
};
