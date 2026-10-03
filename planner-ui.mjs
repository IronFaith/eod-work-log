import { createShift, weekDates, availableWork, assignWork, taskTimeline } from './planner.mjs?v=5.0';
import { localDate, shiftLabel, taskName, taskDetails, replaceTasks, loggedTasks, escapeHTML as esc } from './model.mjs?v=5.0';
import { displayText, richText } from './links.mjs?v=5.0';
import { crewText } from './crew.mjs?v=5.0';

export function setupPlanner({ getState, day, getActiveId, chooseShift, persist, toast, renderTasks, showTab }) {
  const $ = id => document.getElementById(id);
  let week = day().date, historyTask = null, historyShiftId = null;
  const shortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const shiftTitle = shift => `${shortDate(shift.date)} · ${shift.shiftName || 'Shift'}${shift.header.start ? ` · ${shift.header.start}` : ''}`;
  function renderSchedule(date = week) {
    week = date;
    const days = weekDates(week), state = getState();
    $('week-label').textContent = `${shortDate(days[0])} – ${shortDate(days[6])}, ${days[6].slice(0, 4)}`;
    $('week-agenda').innerHTML = days.map(date => {
      const shifts = Object.values(state.days).filter(shift => shift.date === date && (shift.updatedAt || shift.tasks.length || shift.header.start || shift.shiftName)).sort((a, b) => a.header.start.localeCompare(b.header.start));
      const parsed = new Date(`${date}T12:00:00`);
      return `<section class="agenda-day${date === localDate() ? ' is-today' : ''}" aria-label="${esc(shortDate(date))}"><div class="agenda-date"><span>${parsed.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>${parsed.getDate()}</strong>${date === localDate() ? '<small>Today</small>' : ''}</div><div class="agenda-shifts">${shifts.map(shift => {
        const logged = loggedTasks(shift).length, planned = shift.tasks.length - logged;
        const titles = shift.tasks.slice(0, 2).map(task => displayText(taskName(task))).join(' · ');
        return `<button class="agenda-shift" data-open-shift="${esc(shift.id)}"><div><strong>${esc(shift.shiftName || shift.header.location || 'Shift')}</strong><p>${esc(shift.header.start && shift.header.end ? shiftLabel(shift.header) : 'Times not set')}${shift.header.location && shift.shiftName ? ` · ${esc(displayText(shift.header.location))}` : ''}</p><p>${esc(crewText(shift) ? displayText(crewText(shift)).replace(/\n/g, ' · ') : 'Crew not chosen')}</p>${titles ? `<p class="agenda-work-title">${esc(titles)}${shift.tasks.length > 2 ? ` +${shift.tasks.length - 2} more` : ''}</p>` : ''}</div><span class="shift-metrics">${logged} logged · ${planned} planned<br>Open shift →</span></button>`;
      }).join('')}<button class="${shifts.length ? 'text-button agenda-extra' : 'agenda-add'}" data-create-date="${date}">${shifts.length ? '+ Add another shift' : '+ Plan a shift'}</button></div></section>`;
    }).join('');
  }
  function newShift(date) {
    $('new-shift-form').reset(); $('new-shift-error').textContent = '';
    $('new-shift-date').value = date;
    $('new-shift-preset').innerHTML = '<option value="">Your default shift details</option>' + getState().shiftPresets.map(preset => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join('');
    $('new-shift-dialog').showModal();
  }
  function changeWeek(offset) { const date = new Date(`${week}T12:00:00`); date.setDate(date.getDate() + offset); renderSchedule(localDate(date)); }
  $('previous-week').addEventListener('click', () => changeWeek(-7));
  $('next-week').addEventListener('click', () => changeWeek(7));
  $('current-week').addEventListener('click', () => renderSchedule(localDate()));
  $('new-shift').addEventListener('click', () => newShift(week));
  $('week-agenda').addEventListener('click', event => {
    const open = event.target.closest('[data-open-shift]'), create = event.target.closest('[data-create-date]');
    if (open) chooseShift(open.dataset.openShift);
    if (create) newShift(create.dataset.createDate);
  });
  $('new-shift-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const shift = createShift(getState(), $('new-shift-date').value, { name: $('new-shift-name').value, presetId: $('new-shift-preset').value });
      const saved = persist(false); $('new-shift-dialog').close(); chooseShift(shift.id); showTab('shift');
      toast(saved ? 'Shift created. Set the crew and times, then add work.' : 'Shift created — export a backup to keep it.');
    } catch (error) { $('new-shift-error').textContent = error.message; }
  });
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());

  function renderContinue() {
    const query = $('continue-search').value.toLowerCase().trim();
    const items = availableWork(getState(), getActiveId()).filter(({ task }) => displayText([taskName(task), task.ticketId, task.category, task.area].join(' ')).toLowerCase().includes(query));
    $('continue-list').innerHTML = items.map(({ shift, task }) => `<div class="continue-item"><div><strong>${esc(displayText(taskName(task)))}</strong><p>${esc(shiftTitle(shift))}${task.category ? ` · ${esc(task.category)}` : ''}</p></div><button class="button secondary" data-continue-source="${esc(shift.id)}" data-continue-task="${esc(task.id)}">Add to shift</button></div>`).join('') || '<p class="dialog-note small muted">No matching unfinished work to add. Work already on this shift is excluded.</p>';
  }
  $('continue-work').addEventListener('click', () => { $('continue-search').value = ''; renderContinue(); $('continue-dialog').showModal(); });
  $('continue-search').addEventListener('input', renderContinue);
  $('continue-list').addEventListener('click', event => {
    const button = event.target.closest('[data-continue-task]'); if (!button) return;
    try {
      const task = assignWork(getState(), button.dataset.continueSource, button.dataset.continueTask, getActiveId());
      replaceTasks(day(), [...day().tasks, task], 'Continue existing work');
      const saved = persist(); renderTasks(); renderContinue(); toast(saved ? 'Added as planned work. Use Log progress when ready.' : 'Added — export a backup to keep it.');
    } catch (error) { toast(error.message); }
  });

  function openHistory(task) {
    historyTask = task; historyShiftId = getActiveId();
    $('work-history-title').textContent = displayText(taskName(task));
    const state = getState(), timeline = taskTimeline(state, task.workId);
    $('work-timeline').innerHTML = timeline.map(({ shift, task: item }) => `<section class="timeline-item"><strong>${esc(shiftTitle(shift))}</strong><span class="timeline-status">${esc(item.logged === false ? 'Planned' : item.status || 'Logged')}</span><p class="small">${richText(taskDetails(item, { detailed: false }) || (item.logged === false ? 'Progress has not been logged for this shift.' : 'No progress note.'))}</p><button class="text-button" data-timeline-shift="${esc(shift.id)}">Open shift</button></section>`).join('');
    const targets = Object.values(state.days).filter(shift => shift.id !== historyShiftId && shift.date >= day().date && !shift.tasks.some(item => item.workId === task.workId)).sort((a, b) => a.date.localeCompare(b.date) || a.header.start.localeCompare(b.header.start));
    $('assign-shift').innerHTML = targets.length ? targets.map(shift => `<option value="${esc(shift.id)}">${esc(shiftTitle(shift))}</option>`).join('') : '<option value="">Create a future shift in Schedule first</option>';
    $('assign-work').disabled = !targets.length || task.status === 'Completed';
    $('assign-error').textContent = task.status === 'Completed' ? 'Reopen this task before continuing it in another shift.' : '';
    if (!$('work-history-dialog').open) $('work-history-dialog').showModal();
  }
  $('work-timeline').addEventListener('click', event => { const button = event.target.closest('[data-timeline-shift]'); if (button) { $('work-history-dialog').close(); chooseShift(button.dataset.timelineShift); } });
  $('assign-work-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const targetId = $('assign-shift').value, target = getState().days[targetId];
      const assigned = assignWork(getState(), historyShiftId, historyTask.id, targetId);
      replaceTasks(target, [...target.tasks, assigned], 'Assign existing work'); target.updatedAt = new Date().toISOString();
      const saved = persist(false); openHistory(historyTask); toast(saved ? 'Assigned as planned work. Its history is connected.' : 'Assigned — export a backup to keep it.');
    } catch (error) { $('assign-error').textContent = error.message; }
  });
  return { renderSchedule, openHistory };
}
