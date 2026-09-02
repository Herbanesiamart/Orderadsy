/**
 * DateFilter — reusable date range picker component
 * Usage: new DateFilter(triggerEl, callback)
 * Callback receives: { from: Date, to: Date, label: String }
 */
class DateFilter {
  constructor(triggerEl, callback, defaultPreset = 'Last 30 Days') {
    this.trigger   = triggerEl;
    this.callback  = callback;
    this.isOpen    = false;
    this.selecting = false;   // true = waiting for end date
    this.rangeStart = null;
    this.rangeEnd   = null;
    this.hoverDate  = null;

    // Which two months the calendars show
    this._today = new Date();
    this._today.setHours(0, 0, 0, 0);

    const now = new Date();
    this.leftYear  = now.getFullYear();
    this.leftMonth = now.getMonth() - 1;
    if (this.leftMonth < 0) { this.leftMonth = 11; this.leftYear--; }
    this.rightYear  = now.getFullYear();
    this.rightMonth = now.getMonth();

    this.MONTHS = ['Januari','Februari','Maret','April','Mei','Juni',
                   'Juli','Agustus','September','Oktober','November','Desember'];
    this.DAYS   = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
    this.WEEKENDS = [5, 6]; // index 5=Sab, 6=Min (0=Mon baseline)

    this.presets = [
      { label: 'Semua',         fn: () => this._presetAll() },
      { label: 'Hari Ini',      fn: () => this._preset(0, 0) },
      { label: 'Kemarin',       fn: () => this._preset(-1, -1) },
      { label: 'Bulan Ini',     fn: () => this._presetMonthThis() },
      { label: 'Bulan Lalu',    fn: () => this._presetMonthLast() },
      { label: 'Last 7 Days',   fn: () => this._preset(-6, 0) },
      { label: 'Last 30 Days',  fn: () => this._preset(-29, 0) },
      { label: 'Last 90 Days',  fn: () => this._preset(-89, 0) },
    ];

    // Default bisa di-set dari luar, fallback 'Last 30 Days'
    this.activePreset = defaultPreset || 'Last 30 Days';

    this._buildDropdown();
    this._bindTrigger();

    // Apply default & langsung fire callback
    const def = this.presets.find(p => p.label === this.activePreset);
    if (def) def.fn();
    this._applyDefault();
  }

  _applyDefault() {
    const from = this.rangeStart ? new Date(this.rangeStart) : null;
    const to   = this.rangeEnd   ? new Date(this.rangeEnd)   : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to)   to.setHours(23, 59, 59, 999);
    const labelEl = this.trigger.querySelector('.df-label');
    if (labelEl) labelEl.textContent = this.activePreset;
    if (this.callback) this.callback({ from, to, label: this.activePreset });
  }

  /* ── Preset helpers ─────────────────────────────────────────── */
  _dateOffset(offset) {
    const d = new Date(this._today);
    d.setDate(d.getDate() + offset);
    return d;
  }

  _presetAll() {
    this.rangeStart = null;
    this.rangeEnd   = null;
    this.selecting  = false;
    this.hoverDate  = null;
  }

  _preset(startOffset, endOffset) {
    this.rangeStart = this._dateOffset(startOffset);
    this.rangeEnd   = this._dateOffset(endOffset);
    this.selecting  = false;
    this.hoverDate  = null;
  }

  _presetMonthThis() {
    const d = new Date(this._today);
    this.rangeStart = new Date(d.getFullYear(), d.getMonth(), 1);
    this.rangeEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    this.selecting  = false;
    this.hoverDate  = null;
  }

  _presetMonthLast() {
    const d = new Date(this._today);
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const last  = new Date(d.getFullYear(), d.getMonth(), 0);
    this.rangeStart = first;
    this.rangeEnd   = last;
    this.selecting  = false;
    this.hoverDate  = null;
  }

  /* ── Build DOM ──────────────────────────────────────────────── */
  _buildDropdown() {
    // Remove old if exists
    const old = document.getElementById('__df_dropdown');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = '__df_dropdown';
    el.className = 'df-dropdown';
    el.innerHTML = `
      <div class="df-inner">
        <div class="df-sidebar" id="__df_sidebar"></div>
        <div class="df-main">
          <div class="df-calendars">
            <div class="df-cal" id="__df_calL"></div>
            <div class="df-cal" id="__df_calR"></div>
          </div>
          <div class="df-footer">
            <button class="df-btn-cancel" id="__df_cancel">Batal</button>
            <button class="df-btn-apply" id="__df_apply">Terapkan</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.dropdown = el;

    this._renderSidebar();
    this._renderCalendars();

    // Prevent clicks inside dropdown from bubbling to document (would close it)
    el.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('__df_cancel').addEventListener('click', () => this.close());
    document.getElementById('__df_apply').addEventListener('click', () => this._apply());
  }

  _renderSidebar() {
    const el = document.getElementById('__df_sidebar');
    el.innerHTML = this.presets.map(p => `
      <div class="df-preset ${p.label === this.activePreset ? 'active' : ''}"
           data-preset="${p.label}">${p.label}</div>
    `).join('');

    el.querySelectorAll('.df-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const found = this.presets.find(p => p.label === btn.dataset.preset);
        if (!found) return;
        this.activePreset = found.label;
        found.fn();
        // Update calendar view to show relevant months
        if (this.rangeEnd) {
          this.rightYear  = this.rangeEnd.getFullYear();
          this.rightMonth = this.rangeEnd.getMonth();
          this.leftYear   = this.rightYear;
          this.leftMonth  = this.rightMonth - 1;
          if (this.leftMonth < 0) { this.leftMonth = 11; this.leftYear--; }
        }
        this._renderSidebar();
        this._renderCalendars();
      });
    });
  }

  _renderCalendars() {
    document.getElementById('__df_calL').innerHTML = this._buildCalHTML(this.leftYear, this.leftMonth, 'L');
    document.getElementById('__df_calR').innerHTML = this._buildCalHTML(this.rightYear, this.rightMonth, 'R');
    this._bindNavButtons();
    this._bindDayEvents();
  }

  _buildCalHTML(year, month, side) {
    const prevBtn = `<button class="df-nav" data-dir="prev" data-side="${side}">‹</button>`;
    const nextBtn = `<button class="df-nav" data-dir="next" data-side="${side}">›</button>`;
    const header  = `<div class="df-cal-header">${prevBtn}<span class="df-cal-title">${this.MONTHS[month]} ${year}</span>${nextBtn}</div>`;

    const dayHeaders = this.DAYS.map((d, i) =>
      `<div class="df-day-name ${this.WEEKENDS.includes(i) ? 'weekend' : ''}">${d}</div>`
    ).join('');

    // First day of month — JS getDay() is 0=Sun, we want 0=Mon
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
    // Convert to Mon-based: Sun→6, Mon→0, Tue→1...
    const startOffset = (firstDay + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let cells = '';

    for (let i = 0; i < startOffset; i++) {
      cells += `<div class="df-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date   = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      const ts     = date.getTime();
      const dow    = (date.getDay() + 6) % 7; // Mon=0..Sun=6
      const isWknd = this.WEEKENDS.includes(dow);
      const isToday = ts === this._today.getTime();

      let cls = 'df-day';
      if (isWknd)  cls += ' weekend';
      if (isToday) cls += ' today';

      const effectiveEnd = this.selecting && this.hoverDate ? this.hoverDate : this.rangeEnd;

      if (this.rangeStart && ts === this.rangeStart.getTime()) cls += ' range-start';
      if (effectiveEnd && ts === effectiveEnd.getTime())       cls += ' range-end';

      const sTs = this.rangeStart ? this.rangeStart.getTime() : null;
      const eTs = effectiveEnd    ? effectiveEnd.getTime()    : null;
      if (sTs && eTs) {
        const lo = Math.min(sTs, eTs);
        const hi = Math.max(sTs, eTs);
        if (ts > lo && ts < hi) cls += ' in-range';
      }

      cells += `<div class="${cls}" data-ts="${ts}">${d}</div>`;
    }

    return `${header}<div class="df-grid"><div class="df-day-names">${dayHeaders}</div><div class="df-days">${cells}</div></div>`;
  }

  /* ── Event binding ──────────────────────────────────────────── */
  _bindNavButtons() {
    this.dropdown.querySelectorAll('.df-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir  = btn.dataset.dir;
        const side = btn.dataset.side;
        if (side === 'L') {
          if (dir === 'prev') { this.leftMonth--; if (this.leftMonth < 0) { this.leftMonth = 11; this.leftYear--; } }
          else                { this.leftMonth++; if (this.leftMonth > 11){ this.leftMonth = 0;  this.leftYear++;  } }
        } else {
          if (dir === 'prev') { this.rightMonth--; if (this.rightMonth < 0) { this.rightMonth = 11; this.rightYear--; } }
          else                { this.rightMonth++; if (this.rightMonth > 11){ this.rightMonth = 0;  this.rightYear++;  } }
        }
        this._renderCalendars();
      });
    });
  }

  _bindDayEvents() {
    this.dropdown.querySelectorAll('.df-day:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        const ts   = parseInt(cell.dataset.ts);
        const date = new Date(ts);

        if (!this.selecting || !this.rangeStart) {
          // Start new selection
          this.rangeStart = date;
          this.rangeEnd   = null;
          this.hoverDate  = null;
          this.selecting  = true;
          this.activePreset = null;
          this._renderSidebar();
          this._renderCalendars();
        } else {
          // End selection
          if (ts < this.rangeStart.getTime()) {
            this.rangeEnd   = this.rangeStart;
            this.rangeStart = date;
          } else {
            this.rangeEnd = date;
          }
          this.hoverDate = null;
          this.selecting = false;
          this._renderCalendars();
        }
      });

      cell.addEventListener('mouseenter', () => {
        if (!this.selecting || !this.rangeStart) return;
        this.hoverDate = new Date(parseInt(cell.dataset.ts));
        this._renderCalendars();
      });
    });

    // Clear hover when leaving calendar area
    this.dropdown.querySelectorAll('.df-days').forEach(grid => {
      grid.addEventListener('mouseleave', () => {
        if (!this.selecting) return;
        this.hoverDate = null;
        this._renderCalendars();
      });
    });
  }

  _bindTrigger() {
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOpen ? this.close() : this.open();
    });

    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (!this.dropdown.contains(e.target) && e.target !== this.trigger) {
        this.close();
      }
    });
  }

  /* ── Open / Close ───────────────────────────────────────────── */
  open() {
    this._positionDropdown();
    this.dropdown.classList.add('open');
    this.isOpen = true;
  }

  close() {
    this.dropdown.classList.remove('open');
    this.isOpen = false;
  }

  _positionDropdown() {
    const rect = this.trigger.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    const dropW = 720; // approx width

    let left = rect.right + scrollX - dropW;
    if (left < 8) left = 8;

    this.dropdown.style.top  = (rect.bottom + scrollY + 6) + 'px';
    this.dropdown.style.left = left + 'px';
  }

  /* ── Apply ──────────────────────────────────────────────────── */
  _apply() {
    // Preset "Semua" — rangeStart & rangeEnd null
    if (!this.rangeStart && !this.rangeEnd && this.activePreset === 'Semua') {
      const labelEl = this.trigger.querySelector('.df-label');
      if (labelEl) labelEl.textContent = 'Semua';
      this.close();
      if (this.callback) this.callback({ from: null, to: null, label: 'Semua' });
      return;
    }

    if (!this.rangeStart || !this.rangeEnd) {
      if (this.rangeStart && !this.rangeEnd) {
        this.rangeEnd = new Date(this.rangeStart);
      } else {
        return;
      }
    }

    const from = new Date(this.rangeStart);
    from.setHours(0, 0, 0, 0);
    const to = new Date(this.rangeEnd);
    to.setHours(23, 59, 59, 999);

    const label = this.activePreset || this._formatRange(from, to);
    const labelEl = this.trigger.querySelector('.df-label');
    if (labelEl) labelEl.textContent = label;

    this.close();
    if (this.callback) this.callback({ from, to, label });
  }

  _formatRange(from, to) {
    const opts = { day: 'numeric', month: 'short' };
    return `${from.toLocaleDateString('id-ID', opts)} – ${to.toLocaleDateString('id-ID', opts)}`;
  }
}
