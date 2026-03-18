const COMMENT_BANK_STORAGE_KEY = 'report-card-comment-bank';
const SCORE_SCALE = ['1', '2', '3', '3*'];
const STUDENT_HEADERS = [
  'Surname',
  'Forename',
  'House',
  'Progress Towards Target',
  'Approach to Learning',
  'Achievement Grade',
  'Target',
  'Comment',
];

const state = {
  students: [],
  commentBank: loadCommentBank(),
  selectedYearGroup: '',
  selectedTopic: '',
  activeCommentRow: null,
};

const studentCsvInput = document.querySelector('#studentCsvInput');
const settingsCsvInput = document.querySelector('#settingsCsvInput');
const studentTableBody = document.querySelector('#studentTableBody');
const statusMessage = document.querySelector('#statusMessage');
const yearGroupSelect = document.querySelector('#yearGroupSelect');
const topicSelect = document.querySelector('#topicSelect');
const downloadCsvBtn = document.querySelector('#downloadCsvBtn');
const openSettingsBtn = document.querySelector('#openSettingsBtn');
const settingsDialog = document.querySelector('#settingsDialog');
const commentDialog = document.querySelector('#commentDialog');
const closeCommentDialogBtn = document.querySelector('#closeCommentDialogBtn');
const commentList = document.querySelector('#commentList');
const commentDialogTitle = document.querySelector('#commentDialogTitle');
const commentBankSummary = document.querySelector('#commentBankSummary');

studentCsvInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const csvText = await file.text();
    const rows = csvToRows(csvText);
    state.students = normaliseStudentRows(rows);
    statusMessage.textContent = `Loaded ${state.students.length} student record${state.students.length === 1 ? '' : 's'}. Progress and approach set to 3, achievement copied from target.`;
    renderTable();
  } catch (error) {
    statusMessage.textContent = error.message;
    state.students = [];
    renderTable();
  }

  studentCsvInput.value = '';
});

settingsCsvInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const csvText = await file.text();
    const rows = csvToRows(csvText);
    state.commentBank = normaliseCommentRows(rows);
    persistCommentBank();
    refreshSelectors();
    renderCommentBankSummary();
  } catch (error) {
    commentBankSummary.innerHTML = `<p class="helper-text">${error.message}</p>`;
  }

  settingsCsvInput.value = '';
});

yearGroupSelect.addEventListener('change', () => {
  state.selectedYearGroup = yearGroupSelect.value;
  state.selectedTopic = '';
  refreshTopicOptions();
  renderTable();
});

topicSelect.addEventListener('change', () => {
  state.selectedTopic = topicSelect.value;
  renderTable();
});

downloadCsvBtn.addEventListener('click', () => {
  if (!state.students.length) {
    statusMessage.textContent = 'Load a student CSV before downloading.';
    return;
  }

  const csvContent = rowsToCsv([
    STUDENT_HEADERS,
    ...state.students.map((student) => STUDENT_HEADERS.map((header) => student[header] ?? '')),
  ]);

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'report-cards-completed.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});

openSettingsBtn.addEventListener('click', () => settingsDialog.showModal());
closeCommentDialogBtn.addEventListener('click', () => commentDialog.close());
commentDialog.addEventListener('click', (event) => {
  const rect = commentDialog.getBoundingClientRect();
  const isInDialog = rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
  if (!isInDialog) commentDialog.close();
});

function renderTable() {
  if (!state.students.length) {
    studentTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Upload a student CSV to begin.</td></tr>';
    return;
  }

  studentTableBody.innerHTML = '';

  for (const [index, student] of state.students.entries()) {
    const row = document.createElement('tr');
    row.appendChild(textCell(student.Surname));
    row.appendChild(textCell(student.Forename));
    row.appendChild(textCell(student.House));
    row.appendChild(scoreCell(index, 'Progress Towards Target'));
    row.appendChild(scoreCell(index, 'Approach to Learning'));
    row.appendChild(scoreCell(index, 'Achievement Grade'));
    row.appendChild(textCell(student.Target));
    row.appendChild(commentCell(index, student.Comment));
    studentTableBody.appendChild(row);
  }
}

function textCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value ?? '';
  return cell;
}

function scoreCell(index, field) {
  const cell = document.createElement('td');
  const wrapper = document.createElement('div');
  wrapper.className = 'score-control';

  const minusButton = document.createElement('button');
  minusButton.type = 'button';
  minusButton.textContent = '−';
  minusButton.addEventListener('click', () => changeScore(index, field, -1));

  const value = document.createElement('span');
  value.className = 'score-value';
  value.textContent = state.students[index][field];

  const plusButton = document.createElement('button');
  plusButton.type = 'button';
  plusButton.textContent = '+';
  plusButton.addEventListener('click', () => changeScore(index, field, 1));

  wrapper.append(minusButton, value, plusButton);
  cell.appendChild(wrapper);
  return cell;
}

function commentCell(index, currentValue) {
  const cell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'comment-button';
  button.textContent = currentValue || 'Select a comment';
  button.addEventListener('click', () => openCommentPicker(index));
  cell.appendChild(button);
  return cell;
}

function changeScore(index, field, direction) {
  const currentIndex = SCORE_SCALE.indexOf(String(state.students[index][field] ?? '3'));
  const safeIndex = currentIndex === -1 ? 2 : currentIndex;
  const nextIndex = Math.min(SCORE_SCALE.length - 1, Math.max(0, safeIndex + direction));
  state.students[index][field] = SCORE_SCALE[nextIndex];
  renderTable();
}

function openCommentPicker(rowIndex) {
  if (!state.selectedYearGroup || !state.selectedTopic) {
    statusMessage.textContent = 'Select a year group and topic before choosing a comment.';
    return;
  }

  const comments = getCommentsForSelection();
  if (!comments.length) {
    statusMessage.textContent = 'No comments found for the selected year group and topic. Upload or change the comment bank in Settings.';
    return;
  }

  state.activeCommentRow = rowIndex;
  const student = state.students[rowIndex];
  commentDialogTitle.textContent = `Select comment for ${student.Forename} ${student.Surname}`;
  commentList.innerHTML = '';

  for (const comment of comments) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'comment-option';
    button.textContent = comment;
    button.addEventListener('click', () => {
      state.students[rowIndex].Comment = comment;
      commentDialog.close();
      renderTable();
    });
    commentList.appendChild(button);
  }

  commentDialog.showModal();
}

function refreshSelectors() {
  const yearGroups = [...new Set(state.commentBank.map((entry) => entry.yearGroup))].sort();
  yearGroupSelect.innerHTML = '<option value="">Select year group</option>';
  for (const yearGroup of yearGroups) {
    const option = document.createElement('option');
    option.value = yearGroup;
    option.textContent = yearGroup;
    yearGroupSelect.appendChild(option);
  }

  if (!yearGroups.includes(state.selectedYearGroup)) {
    state.selectedYearGroup = '';
    state.selectedTopic = '';
  }

  yearGroupSelect.value = state.selectedYearGroup;
  refreshTopicOptions();
}

function refreshTopicOptions() {
  const topics = state.selectedYearGroup
    ? [...new Set(state.commentBank.filter((entry) => entry.yearGroup === state.selectedYearGroup).map((entry) => entry.topic))].sort()
    : [];

  topicSelect.disabled = !topics.length;
  topicSelect.innerHTML = '<option value="">Select topic</option>';
  for (const topic of topics) {
    const option = document.createElement('option');
    option.value = topic;
    option.textContent = topic;
    topicSelect.appendChild(option);
  }

  if (!topics.includes(state.selectedTopic)) {
    state.selectedTopic = '';
  }

  topicSelect.value = state.selectedTopic;
}

function getCommentsForSelection() {
  return state.commentBank
    .filter((entry) => entry.yearGroup === state.selectedYearGroup && entry.topic === state.selectedTopic)
    .map((entry) => entry.comment);
}

function renderCommentBankSummary() {
  if (!state.commentBank.length) {
    commentBankSummary.innerHTML = '<p class="helper-text">No comment bank uploaded yet.</p>';
    return;
  }

  const counts = new Map();
  for (const entry of state.commentBank) {
    const key = `${entry.yearGroup}__${entry.topic}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  commentBankSummary.innerHTML = `
    <p>${state.commentBank.length} comment${state.commentBank.length === 1 ? '' : 's'} saved locally.</p>
    <div>${[...counts.entries()].map(([key, count]) => {
      const [yearGroup, topic] = key.split('__');
      return `<span class="summary-chip">${escapeHtml(yearGroup)} · ${escapeHtml(topic)} · ${count}</span>`;
    }).join('')}</div>
  `;
}

function loadCommentBank() {
  try {
    const raw = localStorage.getItem(COMMENT_BANK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistCommentBank() {
  localStorage.setItem(COMMENT_BANK_STORAGE_KEY, JSON.stringify(state.commentBank));
}

function normaliseStudentRows(rows) {
  if (rows.length < 2) throw new Error('The student CSV is empty.');
  const headers = rows[0].map((header) => header.trim());
  const missing = STUDENT_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Student CSV is missing required column(s): ${missing.join(', ')}`);

  return rows.slice(1)
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
      return {
        ...record,
        'Progress Towards Target': '3',
        'Approach to Learning': '3',
        'Achievement Grade': record.Target || '3',
        Comment: record.Comment || '',
      };
    });
}

function normaliseCommentRows(rows) {
  if (rows.length < 2) throw new Error('The comment bank CSV is empty.');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const yearIndex = headers.indexOf('year group');
  const topicIndex = headers.indexOf('topic');
  const commentIndex = headers.indexOf('comment');
  if ([yearIndex, topicIndex, commentIndex].includes(-1)) {
    throw new Error('Comment CSV must contain: year group, topic, comment');
  }

  return rows.slice(1)
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row) => ({
      yearGroup: (row[yearIndex] ?? '').trim(),
      topic: (row[topicIndex] ?? '').trim(),
      comment: (row[commentIndex] ?? '').trim(),
    }))
    .filter((entry) => entry.yearGroup && entry.topic && entry.comment);
}

function csvToRows(csvText) {
  const rows = [];
  let row = [];
  let value = '';
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

refreshSelectors();
renderCommentBankSummary();
renderTable();
