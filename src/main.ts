import {
  App, Component, FuzzySuggestModal, ItemView, Keymap, MarkdownRenderer, Menu, Modal, Notice, Platform, Plugin,
  PluginSettingTab, Scope, Setting, TFile, ViewStateResult, WorkspaceLeaf, debounce, moment, normalizePath, requestUrl,
} from "obsidian";
import { RoomUI } from "./ui";

/** Where release builds and the pet model are published. */
const RELEASES = "https://github.com/aceattacker77/obsidian-memory-room/releases";
import { FileInfo, Memory, SPOT_PROPERTY, folderForSpot, groupBySpot, isFaded, toMemory } from "./memories";
import { DEFAULT_RULES, MapRule, parseRules } from "./vaultMap";
import { MOODS, MoodId } from "./mood";
import { SPOTS, SpotDef, spotsInWalkOrder } from "./spots";
import { MusicPlayer, Track, scanMusic } from "./music";

export const VIEW_TYPE = "memory-room";

interface Settings {
  fadeDays: number;
  mood: MoodId | "auto";
  rules: string;
  /** Optional note used as the body of new memories; {{title}} and {{date}} are filled in. */
  template: string;
  /** Folder the music player plays from; empty means the computer's Music folder. */
  musicFolder: string;
  /** 0..1 */
  musicVolume: number;
  musicMuted: boolean;
  /** DJ Whiskers, the pet cat wandering the room. */
  pet: boolean;
}

const DEFAULTS: Settings = {
  fadeDays: 5,
  mood: "auto",
  rules: JSON.stringify(DEFAULT_RULES, null, 2),
  template: "",
  musicFolder: "",
  musicVolume: 0.8,
  musicMuted: false,
  pet: true,
};

interface RoomState {
  spot?: string;
}

class MemoryRoomView extends ItemView {
  ui?: RoomUI;
  private pendingSpot?: string;
  private previewOwner = new Component();

  constructor(leaf: WorkspaceLeaf, private plugin: MemoryRoomPlugin) {
    super(leaf);
    // Keys work while the room has focus: arrows walk, Escape steps back, / finds.
    this.scope = new Scope(this.app.scope);
    this.scope.register([], "ArrowRight", () => { this.ui?.walk(1); return false; });
    this.scope.register([], "ArrowLeft", () => { this.ui?.walk(-1); return false; });
    this.scope.register([], "Escape", () => { this.ui?.resetView(); return false; });
    this.scope.register([], "/", () => { this.plugin.find(); return false; });
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Memory Room"; }
  getIcon(): string { return "armchair"; }

  getState(): Record<string, unknown> {
    return { ...super.getState(), spot: this.ui?.spot };
  }

  async setState(state: RoomState, result: ViewStateResult): Promise<void> {
    if (state?.spot) {
      if (this.ui) this.ui.openSpotById(state.spot);
      else this.pendingSpot = state.spot;
    }
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("memory-room-view");
    this.previewOwner.load();
    const s = this.plugin.settings;
    this.ui = new RoomUI(this.contentEl, {
      fadeDays: s.fadeDays,
      mood: s.mood,
      now: () => Date.now(),
      openNote: (path, evt) => this.plugin.openNote(path, evt),
      renderPreview: (path, el) => this.plugin.renderPreview(path, el, this.previewOwner),
      hover: (path, evt, target) => this.app.workspace.trigger("hover-link", {
        event: evt, source: VIEW_TYPE, hoverParent: this, targetEl: target, linktext: path,
      }),
      fileMenu: (path, evt) => this.plugin.fileMenu(path, evt),
      find: () => this.plugin.find(),
      onMoodChange: (mood) => this.plugin.saveMood(mood),
      onSpotChange: () => this.app.workspace.requestSaveLayout(),
      petModel: () => this.plugin.petModel(),
      music: this.plugin.music && {
        player: this.plugin.music,
        folder: () => this.plugin.musicFolder(),
        rescan: () => this.plugin.scanMusic(true),
        chooseFolder: () => this.plugin.chooseMusicFolder(),
      },
    });
    this.refresh();
    if (this.pendingSpot) {
      this.ui.openSpotById(this.pendingSpot);
      this.pendingSpot = undefined;
    }
  }

  refresh(): void {
    this.ui?.setMemories(groupBySpot(this.plugin.fileInfos(), this.plugin.rules()));
  }

  async onClose(): Promise<void> {
    this.previewOwner.unload();
    this.ui?.dispose();
    this.ui = undefined;
  }
}

/** Native fuzzy finder over every memory in the room. */
/** Fuzzy finder over the songs in the music folder. */
class TrackModal extends FuzzySuggestModal<Track> {
  constructor(app: App, private player: MusicPlayer) {
    super(app);
    this.setPlaceholder("Play a song…");
  }

  getItems(): Track[] {
    return this.player.tracks;
  }

  getItemText(t: Track): string {
    return t.folder ? `${t.title} — ${t.folder}` : t.title;
  }

  onChooseItem(t: Track): void {
    void this.player.play(this.player.tracks.indexOf(t));
  }
}

class FindMemoryModal extends FuzzySuggestModal<Memory> {
  constructor(app: App, private items: Memory[], private choose: (m: Memory, evt: MouseEvent | KeyboardEvent) => void) {
    super(app);
    this.setPlaceholder("Find a memory in the room…");
    this.setInstructions([
      { command: "↵", purpose: "show in the room" },
      { command: "ctrl ↵", purpose: "open the note" },
      { command: "esc", purpose: "dismiss" },
    ]);
  }
  getItems(): Memory[] { return this.items; }
  getItemText(m: Memory): string {
    const spot = SPOTS.find((s) => s.id === m.spot)?.label ?? m.spot;
    return `${m.title} · ${spot} · ${m.path}`;
  }
  onChooseItem(m: Memory, evt: MouseEvent | KeyboardEvent): void { this.choose(m, evt); }
}

/** Pick one of the spots, in walk order. */
class SpotModal extends FuzzySuggestModal<SpotDef | null> {
  constructor(app: App, placeholder: string, private choose: (s: SpotDef | null) => void, private allowClear = false) {
    super(app);
    this.setPlaceholder(placeholder);
  }
  getItems(): (SpotDef | null)[] {
    const spots: (SpotDef | null)[] = spotsInWalkOrder();
    return this.allowClear ? [...spots, null] : spots;
  }
  getItemText(s: SpotDef | null): string {
    return s ? `${s.walk}. ${s.label} (${s.kinds.join(", ")})` : "Remove the room-spot property (use the folder rules)";
  }
  onChooseItem(s: SpotDef | null): void { this.choose(s); }
}

/** The daily tidy: memories past the fade window, with Open, Touch and Archive. */
class FadingModal extends Modal {
  constructor(app: App, private plugin: MemoryRoomPlugin, private items: Memory[]) {
    super(app);
  }
  onOpen(): void {
    this.setTitle(`Fading memories (${this.items.length})`);
    const { contentEl } = this;
    contentEl.addClass("memory-room-fading");
    if (this.items.length === 0) {
      contentEl.createEl("p", { text: "Nothing is fading. Every memory was touched in the last " + this.plugin.settings.fadeDays + " days." });
      return;
    }
    contentEl.createEl("p", { cls: "setting-item-description", text: "Touch sets last-touched to today. Archive moves the note into archive/ and Obsidian updates links to it. Project STATUS files can only be opened here, because their header bullets must change with the property." });
    for (const m of this.items) {
      const s = new Setting(contentEl).setName(m.title).setDesc(`${m.path} · ${moment(m.time).fromNow()}`);
      s.addButton((b) => b.setButtonText("Open").onClick((evt) => { this.plugin.openNote(m.path, evt); this.close(); }));
      if (!m.path.endsWith("/STATUS.md")) {
        s.addButton((b) => b.setButtonText("Touch").onClick(async () => {
          await this.plugin.touch(m.path);
          s.settingEl.remove();
        }));
        if (!m.path.startsWith("archive/")) {
          s.addButton((b) => b.setButtonText("Archive").setWarning().onClick(async () => {
            if (await this.plugin.archive(m.path)) s.settingEl.remove();
          }));
        }
      }
    }
  }
  onClose(): void { this.contentEl.empty(); }
}

export default class MemoryRoomPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };
  /** Desktop only: the music folder is outside the vault. */
  music?: MusicPlayer;
  private scanning?: Promise<void>;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new MemoryRoomView(leaf, this));
    this.registerHoverLinkSource(VIEW_TYPE, { display: "Memory Room", defaultMod: true });
    this.addRibbonIcon("armchair", "Open Memory Room", () => this.activate());
    this.addSettingTab(new MemoryRoomSettings(this.app, this));
    this.registerCommands();
    if (Platform.isDesktopApp) this.setUpMusic();

    // "Show in Memory Room" on notes in the file explorer, tabs and the editor menu.
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && this.memoryFor(file)) {
        menu.addItem((i) => i.setTitle("Show in Memory Room").setIcon("armchair").setSection("view").onClick(() => this.showInRoom(file)));
      }
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, _editor, info) => {
      const file = info.file;
      if (file && this.memoryFor(file)) {
        menu.addItem((i) => i.setTitle("Show in Memory Room").setIcon("armchair").onClick(() => this.showInRoom(file)));
      }
    }));

    // Keep the room in step with the vault. Metadata 'resolved' fires after edits are indexed.
    const refresh = debounce(() => this.refreshViews(), 800, true);
    this.registerEvent(this.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
  }

  onunload(): void {
    this.music?.dispose();
  }

  /** The pet model shipped next to main.js; undefined when the pet is off or the file is missing. */
  async petModel(): Promise<ArrayBuffer | undefined> {
    if (!this.settings.pet || !this.manifest.dir) return undefined;
    const file = normalizePath(`${this.manifest.dir}/cat.glb`);
    if (await this.app.vault.adapter.exists(file)) return this.app.vault.adapter.readBinary(file);
    // Installs that copy only main.js, manifest.json and styles.css (such as BRAT) fetch the model
    // once from this version's release and keep it next to the plugin.
    try {
      const res = await requestUrl({ url: `${RELEASES}/download/${this.manifest.version}/cat.glb` });
      await this.app.vault.adapter.writeBinary(file, res.arrayBuffer);
      return res.arrayBuffer;
    } catch {
      return undefined;
    }
  }

  musicFolder(): string {
    if (this.settings.musicFolder.trim()) return this.settings.musicFolder.trim();
    const os = require("os") as typeof import("os");
    const path = require("path") as typeof import("path");
    return path.join(os.homedir(), "Music");
  }

  private setUpMusic(): void {
    const fs = require("fs") as typeof import("fs");
    const music = (this.music = new MusicPlayer((p) => fs.promises.readFile(p)));
    music.audio.volume = this.settings.musicVolume;
    music.audio.muted = this.settings.musicMuted;
    // Remember volume and mute, without a write for every step of the slider.
    const saveVolume = debounce(() => void this.saveSettings(), 600, true);
    music.subscribe(() => {
      const st = music.state;
      if (st.volume === this.settings.musicVolume && st.muted === this.settings.musicMuted) return;
      this.settings.musicVolume = st.volume;
      this.settings.musicMuted = st.muted;
      saveVolume();
    });
    const bar = this.addStatusBarItem();
    bar.addClass("mod-clickable", "memory-room-music");
    bar.setAttr("aria-label", "Play or pause (Memory Room)");
    bar.onclick = () => void music.toggle();
    const show = () => {
      const st = music.state;
      bar.toggle(!!st.track);
      if (st.track) bar.setText(`${st.playing ? "♪" : "❚❚"} ${st.track.title}`);
    };
    music.subscribe(show);
    show();
    this.app.workspace.onLayoutReady(() => void this.scanMusic(false));

    const needsSongs = (run: () => void) => (checking: boolean) => {
      if (!music.tracks.length) return false;
      if (!checking) run();
      return true;
    };
    this.addCommand({ id: "music-play-pause", name: "Music: Play or pause", checkCallback: needsSongs(() => void music.toggle()) });
    this.addCommand({ id: "music-next", name: "Music: Next song", checkCallback: needsSongs(() => void music.next()) });
    this.addCommand({ id: "music-previous", name: "Music: Previous song", checkCallback: needsSongs(() => void music.previous()) });
    this.addCommand({ id: "music-choose", name: "Music: Play a song…", checkCallback: needsSongs(() => new TrackModal(this.app, music).open()) });
    this.addCommand({ id: "music-rescan", name: "Music: Rescan music folder", callback: () => void this.scanMusic(true) });
    this.addCommand({ id: "music-choose-folder", name: "Music: Choose music folder…", callback: () => void this.chooseMusicFolder() });
    this.addCommand({ id: "music-volume-up", name: "Music: Volume up", callback: () => music.setVolume(music.audio.volume + 0.1) });
    this.addCommand({ id: "music-volume-down", name: "Music: Volume down", callback: () => music.setVolume(music.audio.volume - 0.1) });
    this.addCommand({ id: "music-mute", name: "Music: Mute or unmute", callback: () => music.toggleMute() });
  }

  /** Pick the music folder with the system's folder dialog, then load its songs. */
  async chooseMusicFolder(): Promise<void> {
    const dialog = (require("electron") as { remote?: { dialog?: { showOpenDialog(o: object): Promise<{ canceled: boolean; filePaths: string[] }> } } }).remote?.dialog;
    if (!dialog) {
      new Notice("This version of Obsidian can't open a folder dialog. Type the folder into the Memory Room settings instead.");
      return;
    }
    const res = await dialog.showOpenDialog({ title: "Choose your music folder", defaultPath: this.musicFolder(), properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return;
    this.settings.musicFolder = res.filePaths[0];
    await this.saveSettings();
    await this.scanMusic(true);
  }

  /** Read the music folder's songs into the player. */
  scanMusic(notify: boolean): Promise<void> {
    if (!this.music) return Promise.resolve();
    if (this.scanning) return this.scanning;
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const folder = this.musicFolder();
    const list = async (dir: string) =>
      (await fs.promises.readdir(dir, { withFileTypes: true })).map((d) => ({ name: d.name, dir: d.isDirectory() }));
    this.scanning = scanMusic(folder, list, path.sep)
      .then((tracks) => {
        this.music?.setTracks(tracks);
        if (notify) new Notice(tracks.length ? `${tracks.length} songs in ${folder}.` : `No songs found in ${folder}.`);
      })
      .finally(() => { this.scanning = undefined; });
    return this.scanning;
  }

  private registerCommands(): void {
    this.addCommand({ id: "open", name: "Open", callback: () => this.activate() });
    this.addCommand({ id: "open-window", name: "Open in new window", callback: () => this.activate("window") });
    this.addCommand({ id: "open-sidebar", name: "Open in right sidebar", callback: () => this.activate("sidebar") });
    this.addCommand({ id: "find", name: "Find a memory", callback: () => this.find() });

    for (const s of spotsInWalkOrder()) {
      this.addCommand({
        id: `go-to-${s.id.replace(/_/g, "-")}`,
        name: `Go to spot ${s.walk}: ${s.label}`,
        callback: async () => (await this.activate())?.ui?.openSpotById(s.id),
      });
    }

    const roomCommand = (id: string, name: string, run: (v: MemoryRoomView) => void) =>
      this.addCommand({
        id, name,
        checkCallback: (checking) => {
          const v = this.app.workspace.getActiveViewOfType(MemoryRoomView);
          if (!v?.ui) return false;
          if (!checking) run(v);
          return true;
        },
      });
    roomCommand("walk-next", "Walk to the next spot", (v) => v.ui!.walk(1));
    roomCommand("walk-previous", "Walk to the previous spot", (v) => v.ui!.walk(-1));
    roomCommand("reset-view", "Reset view", (v) => v.ui!.resetView());

    this.addCommand({
      id: "show-current-note",
      name: "Show current note in the room",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.memoryFor(file)) return false;
        if (!checking) this.showInRoom(file);
        return true;
      },
    });

    this.addCommand({
      id: "put-note-on-spot",
      name: "Put current note on a spot…",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          new SpotModal(this.app, `Put "${file.basename}" on…`, async (spot) => {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
              if (spot) fm[SPOT_PROPERTY] = spot.id;
              else delete fm[SPOT_PROPERTY];
            });
            new Notice(spot ? `"${file.basename}" is now on the ${spot.label.toLowerCase()}.` : `"${file.basename}" follows the folder rules again.`);
          }, true).open();
        }
        return true;
      },
    });

    this.addCommand({
      id: "new-memory",
      name: "New memory on a spot…",
      callback: () => new SpotModal(this.app, "New memory on…", (spot) => spot && this.newMemory(spot)).open(),
    });

    for (const m of Object.values(MOODS)) {
      this.addCommand({ id: `light-${m.id}`, name: `Set light: ${m.label}`, callback: () => this.setLight(m.id) });
    }
    this.addCommand({ id: "light-auto", name: "Set light: Your time", callback: () => this.setLight("auto") });

    this.addCommand({
      id: "review-fading",
      name: "Review fading memories",
      callback: () => {
        const now = Date.now();
        const all = [...groupBySpot(this.fileInfos(), this.rules()).values()].flat();
        const fading = all.filter((m) => isFaded(m, now, this.settings.fadeDays) && !m.path.startsWith("archive/"))
          .sort((a, b) => b.time - a.time);
        new FadingModal(this.app, this, fading).open();
      },
    });
  }

  async activate(where: "tab" | "window" | "sidebar" = "tab"): Promise<MemoryRoomView | undefined> {
    const { workspace } = this.app;
    // Reuse a room in the main area; a sidebar room only counts when the sidebar was asked for.
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    let leaf: WorkspaceLeaf | null =
      where === "tab" ? existing.find((l) => l.getRoot() === workspace.rootSplit) ?? null :
      where === "sidebar" ? existing.find((l) => l.getRoot() === workspace.rightSplit) ?? null : null;
    if (!leaf) {
      leaf = where === "window" ? workspace.getLeaf("window") : where === "sidebar" ? workspace.getRightLeaf(false) : workspace.getLeaf("tab");
      if (!leaf) return undefined;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof MemoryRoomView ? leaf.view : undefined;
  }

  async showInRoom(file: TFile): Promise<void> {
    const v = await this.activate();
    if (!v?.ui) return;
    if (!v.ui.showMemory(file.path)) new Notice(`"${file.basename}" is not in the room.`);
  }

  find(): void {
    const all = [...groupBySpot(this.fileInfos(), this.rules()).values()].flat().sort((a, b) => b.time - a.time);
    new FindMemoryModal(this.app, all, async (m, evt) => {
      if (Keymap.isModEvent(evt)) this.openNote(m.path, evt);
      else (await this.activate())?.ui?.showMemory(m.path);
    }).open();
  }

  /** Open a note the way Obsidian links do: plain click in a new tab next to the room, modifiers as usual. */
  openNote(path: string, evt?: MouseEvent | KeyboardEvent): void {
    const mod = evt ? Keymap.isModEvent(evt) : false;
    this.app.workspace.openLinkText(path, "", mod || "tab");
  }

  fileMenu(path: string, evt: MouseEvent): void {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Open in new tab").setIcon("file-plus").onClick(() => this.app.workspace.openLinkText(path, "", "tab")));
    menu.addItem((i) => i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => this.app.workspace.openLinkText(path, "", "split")));
    menu.addSeparator();
    this.app.workspace.trigger("file-menu", menu, file, "memory-room");
    menu.showAtMouseEvent(evt);
  }

  async renderPreview(path: string, el: HTMLElement, owner: Component): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    el.empty();
    if (!file) return;
    const text = await this.app.vault.cachedRead(file);
    let body = text.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/^#\s.*$/m, "").trim();
    if (body.length > 1500) body = body.slice(0, 1500).replace(/\n[^\n]*$/, "") + "\n\n…";
    await MarkdownRenderer.render(this.app, body, el, path, owner);
    // Links inside a custom view are not wired up by Obsidian; follow them like links in a note.
    el.onclick = (evt) => {
      const a = (evt.target as HTMLElement).closest("a.internal-link");
      if (!a) return;
      evt.preventDefault();
      this.app.workspace.openLinkText(a.getAttribute("data-href") ?? "", path, Keymap.isModEvent(evt) || "tab");
    };
  }

  memoryFor(file: TFile): Memory | undefined {
    return file.extension === "md" ? toMemory(this.fileInfo(file), this.rules()) : undefined;
  }

  async newMemory(spot: SpotDef): Promise<void> {
    const folder = folderForSpot(spot.id, this.rules()) ?? "notes";
    const needsProperty = !folderForSpot(spot.id, this.rules());
    const date = moment().format("YYYY-MM-DD");
    const base = `${date} ${spot.label.toLowerCase()} memory`;
    let path = normalizePath(`${folder}/${base}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${folder}/${base} ${i}.md`);
    const title = path.split("/").pop()!.replace(/\.md$/, "");
    let body = `# ${title}\n\n`;
    const tpl = this.settings.template ? this.app.vault.getFileByPath(normalizePath(this.settings.template)) : null;
    if (tpl) body = (await this.app.vault.read(tpl)).replace(/{{title}}/g, title).replace(/{{date}}/g, date);
    if (!(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
    const file = await this.app.vault.create(path, body);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.created ??= date;
      if (needsProperty) fm[SPOT_PROPERTY] = spot.id;
    });
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  async touch(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => { fm["last-touched"] = moment().format("YYYY-MM-DD"); });
  }

  async archive(path: string): Promise<boolean> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return false;
    const target = normalizePath(`archive/${file.name}`);
    if (this.app.vault.getAbstractFileByPath(target)) {
      new Notice(`archive/${file.name} already exists; nothing moved.`);
      return false;
    }
    if (!(await this.app.vault.adapter.exists("archive"))) await this.app.vault.createFolder("archive");
    await this.app.fileManager.renameFile(file, target);
    new Notice(`Moved to ${target}.`);
    return true;
  }

  async setLight(mood: MoodId | "auto"): Promise<void> {
    this.settings.mood = mood;
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof MemoryRoomView && v.ui) v.ui.setMood(mood);
    }
  }

  /** The room's own light menu: remember the choice, as if picked in settings. */
  saveMood(mood: MoodId | "auto"): void {
    if (this.settings.mood === mood) return;
    this.settings.mood = mood;
    void this.saveSettings();
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof MemoryRoomView) v.refresh();
    }
  }

  async reopenViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      await leaf.setViewState({ type: VIEW_TYPE, active: false });
    }
  }

  rules(): MapRule[] {
    try {
      return parseRules(this.settings.rules);
    } catch {
      return DEFAULT_RULES;
    }
  }

  private fileInfo(f: TFile): FileInfo {
    const cache = this.app.metadataCache.getFileCache(f);
    return {
      path: f.path,
      basename: f.basename,
      mtime: f.stat.mtime,
      frontmatter: cache?.frontmatter,
      h1: cache?.headings?.find((h) => h.level === 1)?.heading,
    };
  }

  fileInfos(): FileInfo[] {
    return this.app.vault.getMarkdownFiles().map((f) => this.fileInfo(f));
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULTS, ...(await this.loadData()) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class MemoryRoomSettings extends PluginSettingTab {
  constructor(app: App, private plugin: MemoryRoomPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Light")
      .setDesc("Your time follows the time on this computer, fading from night to morning, afternoon, sunset and back. Changing the light in the room also changes this.")
      .addDropdown((d) => d
        .addOptions({ auto: "Your time", morning: "Morning", afternoon: "Afternoon", sunset: "Sunset", night: "Night" })
        .setValue(s.mood)
        .onChange(async (v) => this.plugin.setLight(v as Settings["mood"])));

    new Setting(containerEl)
      .setName("Fade after (days)")
      .setDesc("Memories untouched for longer than this lose their colour and appear in Review fading memories.")
      .addText((t) => t
        .setValue(String(s.fadeDays))
        .onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) { s.fadeDays = n; await this.plugin.saveSettings(); await this.plugin.reopenViews(); }
        }));

    new Setting(containerEl)
      .setName("New memory template")
      .setDesc("Optional path to a note used as the body of new memories, for example templates/note.md. {{title}} and {{date}} are filled in.")
      .addText((t) => t
        .setPlaceholder("templates/note.md")
        .setValue(s.template)
        .onChange(async (v) => { s.template = v.trim(); await this.plugin.saveSettings(); }));

    const rules = new Setting(containerEl)
      .setName("Folder rules")
      .setDesc("Which folders become which kind of memory. Each kind has a spot: project → desk, note → bookshelf, log → plant, decision → filing cabinet, and so on. The first matching rule wins. A note's room-spot property overrides these.");
    const status = containerEl.createDiv({ cls: "setting-item-description" });
    rules.addTextArea((t) => {
      t.inputEl.rows = 14;
      t.inputEl.addClass("memory-room-rules");
      t.setValue(s.rules).onChange(async (v) => {
        try {
          parseRules(v);
          s.rules = v;
          status.setText("Saved.");
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        } catch (e) {
          status.setText(`Not saved: ${(e as Error).message}`);
        }
      });
    });
    new Setting(containerEl)
      .setName("Pet cat")
      .setDesc("A cat that wanders the room and visits its food dish. Click her and she turns to you and waves. Reopen the room to apply.")
      .addToggle((t) => t.setValue(s.pet).onChange(async (v) => { s.pet = v; await this.plugin.saveSettings(); }));

    if (this.plugin.music) {
      new Setting(containerEl)
        .setName("Music folder")
        .setDesc("The music player plays songs from this folder and its sub-folders. Leave empty for your Music folder.")
        .addText((t) => t
          .setPlaceholder(this.plugin.musicFolder())
          .setValue(s.musicFolder)
          .onChange(async (v) => { s.musicFolder = v; await this.plugin.saveSettings(); }))
        .addButton((b) => b.setButtonText("Choose…").onClick(async () => { await this.plugin.chooseMusicFolder(); this.display(); }))
        .addButton((b) => b.setButtonText("Rescan").onClick(() => void this.plugin.scanMusic(true)));
    }

    new Setting(containerEl)
      .setName("Reset folder rules")
      .setDesc("Go back to the default folder rules.")
      .addButton((b) => b.setButtonText("Reset").onClick(async () => {
        s.rules = DEFAULTS.rules;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
        this.display();
      }));
  }
}
