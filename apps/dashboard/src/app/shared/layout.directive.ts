import { AfterViewChecked, AfterViewInit, Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';
import { LayoutService, PageLayout } from '../core/layout.service';
import { NoticeService } from './notice.component';

@Directive({ selector: '[appLayout]' })
export class LayoutDirective implements AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() appLayout = '';

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly layouts = inject(LayoutService);
  private readonly notice = inject(NoticeService);
  private defaults: PageLayout | null = null;
  private live: PageLayout | null = null;
  private customizing = false;
  private dirty = false;
  private ready = false;
  private dragBox: HTMLElement | null = null;
  private saveTimer = 0;
  private toggle: HTMLButtonElement | null = null;
  private hint: HTMLDivElement | null = null;
  private readonly seen = new WeakSet<HTMLElement>();

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.customizing) return;
    if (document.querySelector('.confirm-back, .sheet-back')) return;
    this.persist(true);
    this.setMode(false);
  };

  ngAfterViewInit(): void {
    this.defaults = this.snapshot();
    const saved = this.layouts.read(this.appLayout);
    if (saved) {
      this.live = saved;
      this.apply(saved);
    }
    this.mount();
    this.bindNew();
    void this.layouts.ensureLoaded().then(() => {
      if (this.dirty || this.customizing) return;
      const fresh = this.layouts.read(this.appLayout);
      this.live = fresh;
      if (fresh) this.apply(fresh);
    });
    document.addEventListener('keydown', this.onKey);
    this.ready = true;
  }

  ngAfterViewChecked(): void {
    if (!this.ready || this.dragBox) return;
    this.bindNew();
    if (!this.live || this.inPlace(this.live)) return;
    this.apply(this.live);
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.saveTimer);
    document.removeEventListener('keydown', this.onKey);
    this.toggle?.remove();
    this.hint?.remove();
  }

  private board(): HTMLElement {
    return this.host.nativeElement;
  }

  private columns(): HTMLElement[] {
    return Array.from(this.board().querySelectorAll(':scope > [data-layout-col]'));
  }

  private boxes(col: HTMLElement): HTMLElement[] {
    return Array.from(col.querySelectorAll(':scope > [data-layout-box]'));
  }

  private box(id: string): HTMLElement | null {
    return this.board().querySelector('[data-layout-box="' + CSS.escape(id) + '"]');
  }

  private snapshot(): PageLayout {
    const data: PageLayout = {};
    this.columns().forEach((col) => {
      const name = col.getAttribute('data-layout-col') || '';
      if (!name) return;
      data[name] = this.boxes(col).map((item) => item.getAttribute('data-layout-box') || '').filter(Boolean);
    });
    return data;
  }

  private apply(layout: PageLayout): void {
    this.columns().forEach((col) => {
      const name = col.getAttribute('data-layout-col') || '';
      (layout[name] || []).forEach((id) => {
        const item = this.box(id);
        if (item) col.appendChild(item);
      });
    });
    this.syncHints();
  }

  private inPlace(layout: PageLayout): boolean {
    return this.columns().every((col) => {
      const name = col.getAttribute('data-layout-col') || '';
      const wanted = (layout[name] || []).filter((id) => this.box(id));
      const actual = this.boxes(col)
        .map((item) => item.getAttribute('data-layout-box') || '')
        .filter((id) => wanted.includes(id));
      return actual.join('\n') === wanted.join('\n');
    });
  }

  private mount(): void {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-ghost';
    toggle.innerHTML = '<i class="bi bi-sliders"></i> Customize';
    toggle.addEventListener('click', () => {
      if (this.customizing) {
        this.persist(true);
        this.setMode(false);
      } else {
        this.setMode(true);
      }
    });
    this.toggle = toggle;
    this.placeToggle(toggle);

    const hint = document.createElement('div');
    hint.className = 'layout-hint';
    hint.hidden = true;
    hint.innerHTML = '<p><strong>Customize layout</strong> Drag a card by its grip or title. Move it up, down, or into another column. Width follows the column. Saved for your login on this page.</p>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-layout-reset>Reset</button>'
      + '<button type="button" class="btn btn-sm" data-layout-done>Done</button>';
    this.board().before(hint);
    this.hint = hint;
    hint.querySelector('[data-layout-reset]')?.addEventListener('click', () => this.reset());
    hint.querySelector('[data-layout-done]')?.addEventListener('click', () => {
      this.persist(true);
      this.setMode(false);
    });

    this.columns().forEach((col) => {
      col.addEventListener('dragover', (event) => this.over(col, event));
      col.addEventListener('dragleave', (event) => {
        if (!col.contains(event.relatedTarget as Node | null)) col.classList.remove('is-drop');
      });
      col.addEventListener('drop', (event) => this.drop(col, event));
    });
  }

  private placeToggle(toggle: HTMLButtonElement): void {
    let node: HTMLElement | null = this.board();
    while (node) {
      const actions = node.querySelector('header.top .top-actions, header.top .profile-actions, header.top .row');
      if (actions) {
        actions.appendChild(toggle);
        return;
      }
      if (node.tagName.startsWith('APP-')) {
        const header = node.querySelector('header.top');
        if (header) header.appendChild(toggle);
        else this.board().before(toggle);
        return;
      }
      node = node.parentElement;
    }
    this.board().before(toggle);
  }

  private bindNew(): void {
    this.columns().forEach((col) => {
      this.boxes(col).forEach((box) => this.bindBox(box));
    });
  }

  private bindBox(box: HTMLElement): void {
    if (this.seen.has(box)) return;
    this.seen.add(box);
    box.classList.add('layout-box');
    if (!box.querySelector(':scope > .layout-handle')) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'layout-handle';
      handle.title = 'Drag to move';
      handle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
      handle.addEventListener('mousedown', () => {
        if (this.customizing) box.setAttribute('draggable', 'true');
      });
      box.prepend(handle);
    }
    box.addEventListener('mousedown', (event) => {
      if (!this.customizing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, input, select, textarea, label, button:not(.layout-handle)')) return;
      box.setAttribute('draggable', 'true');
    });
    box.addEventListener('dragstart', (event) => {
      if (!this.customizing) {
        event.preventDefault();
        return;
      }
      this.dragBox = box;
      box.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', box.getAttribute('data-layout-box') || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragend', () => {
      box.classList.remove('is-dragging');
      box.removeAttribute('draggable');
      this.columns().forEach((col) => col.classList.remove('is-drop'));
      this.live = this.snapshot();
      this.dragBox = null;
      this.syncHints();
      this.persist(false);
    });
  }

  private over(col: HTMLElement, event: DragEvent): void {
    if (!this.customizing || !this.dragBox) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    col.classList.add('is-drop');
    const over = (event.target as HTMLElement | null)?.closest('[data-layout-box]');
    if (!over || over === this.dragBox || over.parentElement !== col) return;
    const rect = over.getBoundingClientRect();
    const horizontal = col.classList.contains('layout-col-row') || col.classList.contains('layout-col-grid');
    const after = horizontal ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
    if (after) over.after(this.dragBox);
    else over.before(this.dragBox);
  }

  private drop(col: HTMLElement, event: DragEvent): void {
    if (!this.customizing) return;
    event.preventDefault();
    col.classList.remove('is-drop');
    const box = this.dragBox;
    if (!box) return;
    if (box.parentElement !== col) col.appendChild(box);
    box.classList.remove('is-dragging');
    box.classList.remove('is-placed');
    void box.offsetWidth;
    box.classList.add('is-placed');
    box.addEventListener('animationend', () => box.classList.remove('is-placed'), { once: true });
    this.syncHints();
  }

  private syncHints(): void {
    this.columns().forEach((col) => {
      let hint = col.querySelector(':scope > .layout-drop-hint');
      if (!this.customizing || this.boxes(col).length) {
        hint?.remove();
        return;
      }
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'layout-drop-hint';
        hint.textContent = 'Drop a card here';
        col.appendChild(hint);
      }
    });
  }

  private setMode(on: boolean): void {
    this.customizing = on;
    this.board().classList.toggle('is-customizing', on);
    if (this.hint) this.hint.hidden = !on;
    this.toggle?.classList.toggle('btn-ghost', !on);
    if (this.toggle) this.toggle.innerHTML = on ? '<i class="bi bi-check2"></i> Done' : '<i class="bi bi-sliders"></i> Customize';
    if (!on) {
      this.columns().forEach((col) => this.boxes(col).forEach((box) => box.removeAttribute('draggable')));
    }
    this.bindNew();
    this.syncHints();
  }

  private persist(tell: boolean): void {
    this.live = this.snapshot();
    this.dirty = true;
    window.clearTimeout(this.saveTimer);
    const send = (): void => {
      if (this.live) this.layouts.save(this.appLayout, this.live);
      if (tell) this.notice.success('Layout saved.');
    };
    if (tell) send();
    else this.saveTimer = window.setTimeout(send, 250);
  }

  private reset(): void {
    this.dirty = true;
    window.clearTimeout(this.saveTimer);
    if (this.defaults) this.apply(this.defaults);
    this.live = null;
    this.bindNew();
    this.layouts.reset(this.appLayout);
    this.notice.success('Layout reset.');
  }
}
