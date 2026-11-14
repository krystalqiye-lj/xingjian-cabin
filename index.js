import {
    characters, default_avatar, doNewChat, getCurrentChatDetails, getPastCharacterChats,
    isGenerating, openCharacterChat, selectCharacterById, this_chid,
} from '../../../../script.js';
import { eventSource, event_types } from '../../../events.js';
import { openWelcomeScreen } from '../../../welcome-screen.js';
import { cabinMarkup } from './cabin-markup.js?v=0.6.0';
import { mountCabin } from './cabin-ui.js?v=0.5.0';
import { mountReaderFrame } from './reader-frame.js';
import { mountReaderResize } from './reader-resize.js?v=0.5.0';
import { mountReaderControls, readerKey, watchTranscript } from './reader-ui.js?v=0.5.2';
import { activeTheme, availableThemes, switchTheme } from './theme-choice.js?v=1';

const $ = id => document.getElementById(id);
const addonLabels = new Set(['芋圆机按钮', '芋圆手机', '美化面板', '剧情核心']);
const floatingTools = '#divine8-root, #divine8-screen, #divine-st-hub, #xhs-float-btn, #xhs-fab, #zxw-pixel-sphere, #ins-persistent-audio-v2';

function nativeButton(className, glyph, text) {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-' + glyph;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = text;
    button.append(icon, label);
    return button;
}

function chatFile(filename) {
    return String(filename ?? '').replace(/\.jsonl$/i, '');
}

function timeValue(value) {
    return typeof value === 'number' ? value : (Date.parse(value) || 0);
}

function characterImage(role) {
    return role?.avatar && role.avatar !== 'none'
        ? '/characters/' + encodeURIComponent(role.avatar)
        : '/' + default_avatar;
}

async function mount() {
    const toolbar = $('top-settings-holder');
    const shell = $('sheld');
    const chat = $('chat');
    const form = $('form_sheld');
    if (!toolbar || !shell || !chat || !form || $('xingjian-cabin-host')) return;

    const host = document.createElement('div');
    host.id = 'xingjian-cabin-host';
    host.hidden = true;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = new URL('./cabin.css?v=0.5.0', import.meta.url).href;
    const loaded = new Promise(resolve => {
        style.onload = () => resolve(true);
        style.onerror = () => resolve(false);
    });
    const template = document.createElement('template');
    template.innerHTML = cabinMarkup;
    shadow.append(style, template.content);
    document.body.append(host);
    if (!await loaded) {
        host.remove();
        console.error('星间无法加载舱室样式。');
        return;
    }

    const head = document.createElement('header');
    head.className = 'xingjian-reader-head';
    head.hidden = true;
    const back = readerKey('disconnect', '退出通讯', 'xingjian-disconnect');
    const backLabel = document.createElement('span');
    backLabel.textContent = '退出通讯';
    back.append(backLabel);
    const identity = document.createElement('div');
    identity.className = 'xingjian-reader-identity';
    const profile = document.createElement('figure');
    profile.className = 'xingjian-reader-profile';
    profile.setAttribute('aria-hidden', 'true');
    const portrait = document.createElement('img');
    portrait.alt = '';
    portrait.draggable = false;
    portrait.decoding = 'async';
    portrait.addEventListener('error', () => {
        const fallback = '/' + default_avatar;
        if (portrait.getAttribute('src') !== fallback) {
            portrait.src = fallback;
            reader.setProfile(name.textContent, fallback);
        }
    });
    const caption = document.createElement('figcaption');
    profile.append(portrait, caption);
    const headingCopy = document.createElement('div');
    headingCopy.className = 'xingjian-reader-copy';
    const name = document.createElement('strong');
    name.className = 'xingjian-reader-name';
    const status = document.createElement('span');
    status.className = 'xingjian-reader-status';
    status.textContent = '通讯中';
    headingCopy.append(name, status);
    identity.append(profile, headingCopy);
    const headerActions = document.createElement('div');
    headerActions.className = 'xingjian-reader-actions';
    head.append(back, identity, headerActions);
    shell.prepend(head);

    const readerFrame = mountReaderFrame(shell, form, profile);
    const readerResize = mountReaderResize(shell);
    const reader = mountReaderControls(shell, head, [
        ['connection', 'API 连接', () => openDrawer('sys-settings-button', 'API 连接')],
        ['persona', '我的人设', () => openDrawer('persona-management-button', '我的人设')],
        ['sessions', '通讯存档', openSessions],
        ['tools', '显示附加工具', toggleAddons, true],
    ]);
    headingCopy.append(reader.profileKey);
    const addons = reader.tools.get('tools');
    addons.setAttribute('aria-pressed', 'false');
    addons.hidden = true;
    headerActions.append(...reader.keys);
    watchTranscript(chat);

    const visited = new Map();
    let historyOrigin = 'home';
    let archiveOpening = false;
    let selectedDrawer;
    let pendingCatalog;
    let catalogSignature = '';
    let hasQuickAddons = false;
    let readerSession = '';

    const ui = mountCabin(shadow, {
        openDrawer, closeDrawer, openRole, readSessions, pageChanged,
        importRole: () => {
            openDrawer('rightNavHolder', '角色管理');
            $('character_import_button')?.click();
        },
    });
    const themeOption = shadow.getElementById('cabin-theme-option');
    const themeLinks = shadow.getElementById('cabin-theme-links');
    const themeStatus = shadow.getElementById('cabin-theme-status');
    for (const { id, label } of availableThemes()) {
        if (id === 'xingjian') continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'holo-key';
        button.dataset.scenicTheme = id;
        button.textContent = '前往' + label;
        button.addEventListener('click', () => {
            if (isGenerating()) themeStatus.textContent = '回复结束后就可以切换。';
            else if (!switchTheme(id)) themeStatus.textContent = '主题不可用，或暂时无法保存选择。';
            else return;
            themeStatus.hidden = false;
        });
        themeLinks.append(button);
    }
    themeOption.hidden = !themeLinks.childElementCount;

    back.addEventListener('click', () => ui.setPage(historyOrigin));

    function openSessions() {
        const details = getCurrentChatDetails();
        if (details.group) $('option_select_chat')?.click();
        else if (characters[this_chid]?.avatar) ui.openSessions(characters[this_chid].avatar);
    }

    function setAddons(open) {
        shell.classList.toggle('xingjian-show-addons', open);
        addons.setAttribute('aria-pressed', String(open));
        addons.textContent = open ? '收起附加工具' : '显示附加工具';
        refreshFloatingTools();
    }
    function toggleAddons() { setAddons(!shell.classList.contains('xingjian-show-addons')); }

    // Only the separate card launchers are suppressed. Card content and CSS stay active.
    const inertWidgets = new Map();
    const watchedPlayers = new WeakSet();
    function quietPlayer(player, widget) {
        if (!(player instanceof HTMLMediaElement)) return;
        if (!watchedPlayers.has(player)) {
            watchedPlayers.add(player);
            player.addEventListener('play', () => {
                if (widget.hasAttribute('data-xingjian-widget-hidden')) player.pause();
            });
        }
        if (!player.paused) player.pause();
    }
    function refreshFloatingTools() {
        const nodes = [...document.querySelectorAll(floatingTools)].filter(node => !chat.contains(node));
        const hide = ui.page !== 'reading' || !shell.classList.contains('xingjian-show-addons');
        for (const [node, wasInert] of inertWidgets) {
            if (!hide || !node.isConnected || !nodes.includes(node)) {
                node.inert = wasInert;
                node.removeAttribute('data-xingjian-widget-hidden');
                inertWidgets.delete(node);
            }
        }
        if (hide) for (const node of nodes) {
            if (!inertWidgets.has(node)) {
                inertWidgets.set(node, node.inert);
                node.inert = true;
                node.setAttribute('data-xingjian-widget-hidden', '');
            }
            const contents = node.shadowRoot ?? node;
            for (const player of contents.querySelectorAll('audio, video')) quietPlayer(player, node);
            if (node.matches('#zxw-pixel-sphere')) quietPlayer(window._wiz_shared_audio_stream, node);
        }
        addons.hidden = !hasQuickAddons && !nodes.length;
    }
    function hasFloatingWidget(node) {
        return node instanceof Element && (node.matches(floatingTools) || (node.childElementCount && node.querySelector(floatingTools)));
    }
    new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(hasFloatingWidget))) refreshFloatingTools();
    }).observe(document.documentElement, { childList: true, subtree: true });

    function markAddons() {
        const quickReplies = shell.querySelector('#qr--bar.TH--qr--bar');
        let found = false;
        for (const group of quickReplies?.querySelectorAll('.qr--buttons') ?? []) {
            const keys = [...group.querySelectorAll('.qr--button')];
            let matching = 0;
            for (const key of keys) {
                const label = key.textContent.replace(/[^\p{Script=Han}]/gu, '');
                const matches = addonLabels.has(label);
                key.toggleAttribute('data-xingjian-addon', matches);
                matching += Number(matches);
            }
            found ||= matching > 0;
            group.toggleAttribute('data-xingjian-addon', matching > 0 && matching === keys.length);
        }
        if (quickReplies) {
            quickReplies.toggleAttribute('data-xingjian-addon', found && !quickReplies.querySelector('.qr--button:not([data-xingjian-addon])'));
        }
        hasQuickAddons = found;
        refreshFloatingTools();
    }
    const composer = $('send_form');
    if (composer) {
        new MutationObserver(markAddons).observe(composer, { childList: true, characterData: true, subtree: true });
        markAddons();
    }
    const input = $('send_textarea');
    const connectedPrompt = '输入通讯内容';
    const offlinePrompt = '尚未连接 API';
    function updateInputPrompt(reading) {
        if (!input) return;
        const connected = input.getAttribute('connected_text');
        const offline = input.getAttribute('no_connection_text');
        if (reading && connected && input.placeholder === connected) input.placeholder = connectedPrompt;
        else if (reading && offline && input.placeholder === offline) input.placeholder = offlinePrompt;
        else if (!reading && input.placeholder === connectedPrompt) input.placeholder = connected || '';
        else if (!reading && input.placeholder === offlinePrompt) input.placeholder = offline || '';
    }
    if (input) {
        new MutationObserver(() => updateInputPrompt(ui.page === 'reading'))
            .observe(input, { attributes: true, attributeFilter: ['placeholder'] });
    }

    function updateReader() {
        const details = getCurrentChatDetails();
        const displayName = details.characterName || '通讯记录';
        const groupImage = details.group && details.avatarImgURL;
        const image = groupImage && groupImage !== 'none' ? groupImage : characterImage(details.group ? null : characters[this_chid]);
        if (portrait.getAttribute('src') !== image) portrait.src = image;
        name.textContent = displayName;
        caption.textContent = displayName;
        headingCopy.title = displayName;
        reader.setProfile(displayName, image);
        const sessions = reader.tools.get('sessions');
        sessions.title = details.sessionName || '通讯存档';
        sessions.disabled = !(details.characterName || details.group);
        const session = JSON.stringify([details.group?.id, characters[this_chid]?.avatar, details.sessionName]);
        const changed = readerSession !== session;
        readerSession = session;
        return changed;
    }

    function pageChanged(next, previous) {
        closeDrawer();
        const reading = next === 'reading';
        if ($('qinghe-library')?.hidden === false) $('qinghe-toggle')?.click();
        document.body.dataset.xingjianMode = next;
        host.hidden = false;
        shell.inert = !reading;
        head.hidden = !reading;
        updateInputPrompt(reading);
        readerResize.sync();
        reader.close();
        const changed = reading && updateReader();
        if (!reading || changed) setAddons(false);
        if (reading) {
            reader.dockCardTools();
            if (previous !== 'reading' || changed) {
                readerFrame.project(host.dataset.still === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches);
            } else readerFrame.draw();
        }
    }

    function releaseDrawer(entry) {
        entry.observer.disconnect();
        entry.panel.removeAttribute('data-xingjian-panel');
        entry.heading?.remove();
        if (selectedDrawer === entry) selectedDrawer = null;
    }

    function closeDrawer() {
        if (!selectedDrawer) return;
        const entry = selectedDrawer;
        if (entry.panel.classList.contains('openDrawer')) entry.toggle.click();
        releaseDrawer(entry);
    }

    function openDrawer(id, label) {
        const drawer = $(id);
        const toggle = drawer?.querySelector(':scope > .drawer-toggle');
        const panel = drawer?.querySelector(':scope > .drawer-content');
        if (!toggle || !panel) return false;
        if (selectedDrawer?.panel === panel && panel.classList.contains('openDrawer')) return true;
        closeDrawer();
        const trigger = toggle.querySelector('.drawer-icon') ?? toggle;
        const entry = { panel, toggle: trigger, observer: null, heading: null };
        let wasOpen = panel.classList.contains('openDrawer');
        entry.observer = new MutationObserver(() => {
            if (panel.classList.contains('openDrawer')) wasOpen = true;
            else if (wasOpen) releaseDrawer(entry);
        });
        selectedDrawer = entry;
        panel.setAttribute('data-xingjian-panel', '');
        if (!panel.querySelector(':scope > .qinghe-panel-heading')) {
            const heading = document.createElement('div');
            heading.className = 'xingjian-drawer-heading';
            const title = document.createElement('strong');
            title.textContent = label;
            const close = nativeButton('xingjian-key', 'xmark', '关闭');
            close.addEventListener('click', closeDrawer);
            heading.append(title, close);
            panel.prepend(heading);
            entry.heading = heading;
        }
        entry.observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        if (!wasOpen) trigger.click();
        return true;
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && selectedDrawer && !document.querySelector('dialog[open]')) closeDrawer();
    });

    function syncCatalog() {
        const items = characters.filter(role => role?.avatar).map(role => ({
            id: role.avatar,
            name: role.name || '未命名角色',
            image: characterImage(role),
            hasChat: Number(role.date_last_chat) > 0 || visited.has(role.avatar),
            activity: Math.max(Number(role.date_last_chat) || 0, visited.get(role.avatar) || 0),
        })).sort((left, right) => right.activity - left.activity || left.name.localeCompare(right.name, 'zh-CN'));
        const signature = JSON.stringify(items);
        if (signature === catalogSignature) return;
        catalogSignature = signature;
        ui.setRoles(items);
    }

    function queueCatalog() {
        if (pendingCatalog !== undefined) return;
        pendingCatalog = setTimeout(() => {
            pendingCatalog = undefined;
            syncCatalog();
        }, 90);
    }

    function roleIndex(id) {
        return characters.findIndex(role => role?.avatar === id);
    }

    async function readSessions(id) {
        const index = roleIndex(id);
        if (index === -1) throw new Error('角色已不在档案中。');
        const current = chatFile(characters[index].chat);
        const sessions = await getPastCharacterChats(index);
        return sessions.filter(session => typeof session.file_name === 'string')
            .sort((a, b) => timeValue(b.last_mes) - timeValue(a.last_mes))
            .map(session => ({
                file: chatFile(session.file_name),
                detail: String(session.mes || session.preview_message || '').replace(/\s+/g, ' ').trim().slice(0, 100) ||
                    (Number(session.chat_items) > 0 ? session.chat_items + ' 条消息' : '暂无消息预览'),
                current: current === chatFile(session.file_name),
            }));
    }

    async function openRole(id, { file, create, origin }) {
        let index = roleIndex(id);
        if (index === -1) throw new Error('角色已不在档案中。');
        if (isGenerating()) throw new Error('当前回复还在生成，请稍后再切换。');
        archiveOpening = true;
        try {
            const archives = (file || create) ? await getPastCharacterChats(index) : [];
            if (file && !archives.some(session => chatFile(session.file_name) === file)) {
                throw new Error('找不到这份存档，请重新打开存档列表。');
            }
            index = roleIndex(id);
            if (index === -1) throw new Error('角色已不在档案中。');
            await selectCharacterById(index, { switchMenu: false });
            if (characters[this_chid]?.avatar !== id || getCurrentChatDetails().group) {
                throw new Error('酒馆正在保存或切换，请稍后重试。');
            }
            if (create && archives.length) await doNewChat();
            else if (file && getCurrentChatDetails().sessionName !== file) await openCharacterChat(file);
            visited.set(id, Date.now());
            queueCatalog();
            if (origin === 'home' || origin === 'library') historyOrigin = origin;
            ui.setPage('reading');
        } finally {
            archiveOpening = false;
        }
    }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        const details = getCurrentChatDetails();
        if (!details.group && characters[this_chid]?.avatar) visited.set(characters[this_chid].avatar, Date.now());
        queueCatalog();
        if (archiveOpening) return;
        if (!details.characterName) {
            if (ui.page === 'reading') ui.setPage('home');
            return;
        }
        if (ui.page === 'library') historyOrigin = 'library';
        else if (ui.page === 'home') historyOrigin = 'home';
        ui.setPage('reading');
    });
    for (const event of [
        event_types.CHARACTER_EDITED, event_types.CHARACTER_DELETED, event_types.CHARACTER_DUPLICATED,
        event_types.CHARACTER_RENAMED, event_types.CHAT_CREATED, event_types.CHAT_DELETED, event_types.CHAT_RENAMED,
    ]) {
        eventSource.on(event, queueCatalog);
    }
    const characterList = $('rm_print_characters_block');
    if (characterList) new MutationObserver(queueCatalog).observe(characterList, { childList: true, subtree: true });

    syncCatalog();
    ui.setPage('home');

    // Suppress the native welcome page only after the cabin has mounted successfully.
    eventSource.removeListener(event_types.APP_READY, openWelcomeScreen);
    eventSource.removeListener(event_types.CHAT_CHANGED, openWelcomeScreen);
    eventSource.makeLast(event_types.APP_READY, () => {
        if ($('qinghe-library')?.hidden === false) $('qinghe-toggle')?.click();
        shell.inert = ui.page !== 'reading';
        updateInputPrompt(ui.page === 'reading');
        if (ui.page === 'reading') reader.dockCardTools();
        for (const [id, label] of [
            ['options_button', '通讯菜单'], ['send_but', '发送通讯'], ['extensionsMenuButton', '扩展工具'],
        ]) {
            const key = $(id);
            if (!key) continue;
            key.title = label;
            key.setAttribute('aria-label', label);
        }
    });
}

eventSource.on(event_types.APP_INITIALIZED, async () => {
    if (activeTheme() !== 'xingjian') return;
    document.body.dataset.xingjianStarting = '';
    try {
        await mount();
    } catch (error) {
        console.error('星间启动失败', error);
    } finally {
        delete document.body.dataset.xingjianStarting;
    }
});
