const resultEl = document.getElementById('result');
const btn = document.getElementById('analyze-btn');
const textarea = document.getElementById('transactions-input');

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s0 = value.trim();
  if (!s0) return null;

  const s1 = s0
    .replace(/[−–—]/g, '-')
    .replace(/[^\d,.\-\s\u00A0]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!s1) return null;

  const lastDot = s1.lastIndexOf('.');
  const lastComma = s1.lastIndexOf(',');
  let normalized = s1;

  if (lastDot !== -1 && lastComma !== -1) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thousands = dec === '.' ? ',' : '.';
    normalized = normalized.split(thousands).join('').split(' ').join('');
    if (dec === ',') normalized = normalized.split(',').join('.');
  } else {
    normalized = normalized.split(' ').join('');
    const commaCount = (normalized.match(/,/g) || []).length;
    const dotCount = (normalized.match(/\./g) || []).length;
    if (commaCount > 1) {
      const idx = normalized.lastIndexOf(',');
      normalized =
        normalized.slice(0, idx).split(',').join('') + '.' + normalized.slice(idx + 1);
    } else if (dotCount > 1) {
      const idx = normalized.lastIndexOf('.');
      normalized =
        normalized.slice(0, idx).split('.').join('') + '.' + normalized.slice(idx + 1);
    } else {
      normalized = normalized.split(',').join('.');
    }
  }

  normalized = normalized.replace(/(?!^)-/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeTransactions(input = []) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const amount = parseMoney(raw.amount);
    if (amount == null) continue;
    const type = String(raw.type || '').toLowerCase();
    if (type !== 'income' && type !== 'expense') continue;
    const description = String(raw.description || '').slice(0, 200);
    out.push({ amount: Math.abs(amount), type, description });
  }
  return out;
}

function analyzeTransactions(transactions = []) {
  let totalIncome = 0;
  let totalCashIncome = 0;
  let totalExpense = 0;
  let offshoreLikePayments = 0;
  let suspiciousNotes = 0;
  let incomeCount = 0;
  let incomeRoundishCount = 0;
  let expenseCount = 0;
  let transfersToIndividuals = 0;
  let salaryLikeIncome = 0;
  let businessServiceIncome = 0;

  const suspiciousKeywords = ['налом', 'cash', 'обнал', 'обналичка', 'offshore', 'оффшор'];
  const keywordSets = {
    cash: ['нал', 'налом', 'қолма', 'қолма-қол', 'cash', 'обнал', 'обналич'],
    crypto: ['crypto', 'крипто', 'usdt', 'binance', 'p2p', 'kyc', 'wallet', 'биржа', 'exchange'],
    salary: ['жалақы', 'зарплата', 'oklad', 'оклад', 'salary', 'payroll'],
    services: ['қызмет', 'услуга', 'consult', 'консультац', 'freelance', 'фриланс', 'service'],
    transfer: ['аударым', 'перевод', 'to card', 'картаға', 'на карту', 'kaspi', 'qiwi', 'сбп']
  };

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    const type = (tx.type || '').toLowerCase();
    const desc = (tx.description || '').toLowerCase();

    if (type === 'income') {
      totalIncome += amount;
      incomeCount += 1;
      if (Number.isFinite(amount) && Math.abs(amount) >= 1000 && Math.abs(amount) % 1000 === 0) {
        incomeRoundishCount += 1;
      }
      if (keywordSets.cash.some((k) => desc.includes(k))) totalCashIncome += amount;
      if (keywordSets.salary.some((k) => desc.includes(k))) salaryLikeIncome += amount;
      if (keywordSets.services.some((k) => desc.includes(k))) businessServiceIncome += amount;
    }

    if (type === 'expense') {
      totalExpense += amount;
      expenseCount += 1;
      if (keywordSets.transfer.some((k) => desc.includes(k))) transfersToIndividuals += 1;
    }

    if (keywordSets.crypto.some((k) => desc.includes(k))) offshoreLikePayments += 1;
    if (suspiciousKeywords.some((kw) => desc.includes(kw))) suspiciousNotes += 1;
  }

  const riskFactors = [];
  let riskScore = 0;

  if (totalIncome > 0 && totalCashIncome / totalIncome > 0.5) {
    riskScore += 2;
    riskFactors.push('Жалпы табысқа қарағанда қолма‑қол түсімдердің үлесі өте жоғары.');
  }

  if (offshoreLikePayments >= 1) {
    riskScore += offshoreLikePayments >= 3 ? 2 : 1;
    riskFactors.push('Крипто/оффшорлық сервистерге ұқсайтын операциялар бар.');
  }

  if (suspiciousNotes >= 1) {
    riskScore += suspiciousNotes >= 3 ? 2 : 1;
    riskFactors.push('Төлемдерде күмәнді сөздер/сипаттамалар кездеседі.');
  }

  if (totalIncome > 0 && businessServiceIncome / totalIncome >= 0.5 && salaryLikeIncome === 0) {
    riskScore += 1;
    riskFactors.push(
      'Табыстың басым бөлігі “қызмет/кеңес” сияқты сипаттамамен түседі (ресми табысқа ұқсамайды).'
    );
  }

  if (expenseCount >= 10 && transfersToIndividuals / expenseCount >= 0.5) {
    riskScore += 1;
    riskFactors.push('Шығыстардың едәуір бөлігі адамдарға/картаға аударым түрінде кетеді.');
  }

  if (incomeCount >= 10 && incomeRoundishCount / incomeCount >= 0.6) {
    riskScore += 1;
    riskFactors.push('Табыс операциялары тым жиі және сомалар көбіне дөңгелек (мыңдық).');
  }

  let level = 'төмен';
  if (riskScore >= 1 && riskScore <= 2) level = 'орташа';
  if (riskScore > 2) level = 'жоғары';

  const recommendations = [];
  if (level !== 'төмен') {
    recommendations.push(
      'Табысты ресми түрде көрсету: келісімшарт/инвойс және төлем мақсатын нақты жазу.'
    );
    recommendations.push('Қолма‑қол ақшаны азайтып, ресми банктік аударымдарды қолдану.');
    recommendations.push(
      'Кәсіпкерлік түсім болса — ИП/ЖК арқылы тіркеліп, салықты уақтылы төлеу.'
    );
  }
  if (offshoreLikePayments > 0) {
    recommendations.push(
      'Крипто операциялары болса — есептілік/декларация талаптарын сақтап, құжаттарды сақтау.'
    );
  }
  if (suspiciousNotes > 0) {
    recommendations.push('Төлем сипаттамасында “нал/обнал/cash” сияқты сөздерді қолданбау.');
  }
  if (!recommendations.length) {
    recommendations.push(
      'Айқын тәуекел белгісі табылмады. Дегенмен құжаттарды сақтап, төлем мақсаттарын нақты жазыңыз.'
    );
  }

  return {
    totalIncome,
    totalCashIncome,
    totalExpense,
    riskScore,
    level,
    riskFactors,
    recommendations,
    disclaimer:
      'Нәтиже тек бағдарлық және оқу мақсатында берілген, ол құқықтық немесе салықтық кеңес болып табылмайды.'
  };
}

function renderError(message) {
  resultEl.innerHTML = `<p class="error">${message}</p>`;
}

function renderResult(data) {
  const levelClass =
    data.level === 'жоғары'
      ? 'badge-high'
      : data.level === 'орташа'
      ? 'badge-medium'
      : 'badge-low';

  const parsedInfo =
    data.sourceSummary && typeof data.sourceSummary.parsedTransactions === 'number'
      ? `<div class="stats">Танылған операция саны: <strong>${data.sourceSummary.parsedTransactions.toLocaleString(
          'kk-KZ'
        )}</strong></div>`
      : '';

  const preview =
    data.sourceSummary && Array.isArray(data.sourceSummary.preview) && data.sourceSummary.preview.length
      ? `<div>
          Тексеру үшін алғашқы операциялар (preview):
          <ul class="factors">
            ${data.sourceSummary.preview
              .slice(0, 10)
              .map(
                (t) =>
                  `<li><strong>${t.type}</strong> — ${Number(t.amount || 0).toLocaleString(
                    'kk-KZ'
                  )} ₸<br/><span class="disclaimer">${String(t.description || '')}</span></li>`
              )
              .join('')}
          </ul>
        </div>`
      : '';

  resultEl.innerHTML = `
    <div class="result-level">
      Тәуекел деңгейі: 
      <span class="badge ${levelClass}">${data.level.toUpperCase()}</span>
    </div>
    ${parsedInfo}
    ${preview}
    <div class="stats">
      Жалпы табыс: <strong>${data.totalIncome.toLocaleString('kk-KZ')} ₸</strong><br/>
      Соның ішінде қолма‑қол/"cash": <strong>${data.totalCashIncome.toLocaleString('kk-KZ')} ₸</strong><br/>
      Жалпы шығыс: <strong>${(data.totalExpense || 0).toLocaleString('kk-KZ')} ₸</strong><br/>
      Жиынтық тәуекел балы (эвристика): <strong>${data.riskScore}</strong>
    </div>
    ${
      data.riskFactors && data.riskFactors.length
        ? `<div>
            Мүмкін тәуекел факторлары:
            <ul class="factors">
              ${data.riskFactors.map((f) => `<li>${f}</li>`).join('')}
            </ul>
          </div>`
        : '<p>Берілген ережелер бойынша айқын жоғары тәуекел факторлары табылмады.</p>'
    }
    ${
      data.recommendations && data.recommendations.length
        ? `<div>
            Күмән аз болу үшін ұсыныстар:
            <ul class="factors">
              ${data.recommendations.map((r) => `<li>${r}</li>`).join('')}
            </ul>
          </div>`
        : ''
    }
    <p class="disclaimer">${data.disclaimer}</p>
  `;
}

btn.addEventListener('click', async () => {
  let parsed;
  try {
    parsed = JSON.parse(textarea.value);
  } catch (e) {
    renderError('JSON оқу қатесі. Форматын тексеріңіз.');
    return;
  }

  if (!Array.isArray(parsed)) {
    renderError('Күтілетіні — транзакциялар JSON‑массиві.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Талдау...';
  renderError('Талдау жүріп жатыр...');

  try {
    const normalized = normalizeTransactions(parsed);
    if (!normalized.length) {
      renderError('Транзакциялар табылмады немесе формат қате.');
      return;
    }
    const data = analyzeTransactions(normalized);
    renderResult({
      ...data,
      sourceSummary: { parsedTransactions: normalized.length, preview: normalized.slice(0, 10) }
    });
  } catch (e) {
    console.error(e);
    renderError(`Талдау сәтсіз өтті: ${e.message || 'қате'}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Талдау жасау';
  }
});

const pdfInput = document.getElementById('pdf-input');
const pdfBtn = document.getElementById('analyze-pdf-btn');

if (pdfInput && pdfBtn) {
  pdfBtn.addEventListener('click', async () => {
    if (!pdfInput.files || !pdfInput.files[0]) {
      renderError('PDF файлды таңдаңыз.');
      return;
    }

    const file = pdfInput.files[0];
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) {
      renderError('Тек PDF файлдары (.pdf) қолдау табады.');
      return;
    }

    pdfBtn.disabled = true;
    const originalText = pdfBtn.textContent;
    pdfBtn.textContent = 'PDF талдау...';
    renderError('PDF талдау жүріп жатыр...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      if (!window.pdfjsLib) throw new Error('PDF оқу модулі жүктелмеді (pdf.js).');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.js';

      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p += 1) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items.map((it) => it.str).join('\n');
        text += `\n${pageText}\n`;
      }

      // Very simple local PDF line parser (same idea as server, but fully offline).
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const txs = [];
      const seen = new Set();
      const dateLike = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g;
      const amountCandidate =
        /[−-]?\s*\d{1,3}(?:[\s\u00A0]\d{3})*(?:[.,]\d{1,2})?|[−-]?\s*\d+(?:[.,]\d{1,2})?/g;

      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (
          /итого|остаток|баланс|сальдо|страниц|page|валюта|currency|iban|карта|счет|шот/.test(
            lowerLine
          )
        ) {
          continue;
        }

        const withoutDates = line.replace(dateLike, ' ').trim();
        if (!/[a-zа-яәіңғүұқөһ]/i.test(withoutDates)) continue;

        const candidates = (withoutDates.match(amountCandidate) || []).slice(0, 10);
        const nums = candidates
          .map((c) => parseMoney(c))
          .filter((n) => n != null)
          .filter((n) => Math.abs(n) >= 100 && Math.abs(n) < 1e9);
        if (!nums.length) continue;

        let amount = nums.find((n) => n < 0) ?? nums.find((n) => n > 0 && /[+\-−]\s*\d/.test(withoutDates));
        if (amount == null) amount = nums.slice().sort((a, b) => Math.abs(a) - Math.abs(b))[0];
        if (amount == null) continue;

        const isExpense =
          amount < 0 ||
          /списание|оплата|покупка|комиссия|перевод|withdraw|debit|spisanie|fee|шығыс|төлем|сатып алу/.test(
            lowerLine
          );

        const tx = {
          amount: Math.abs(amount),
          type: isExpense ? 'expense' : 'income',
          description: line.slice(0, 200)
        };

        const key = `${tx.type}|${tx.amount}|${tx.description.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        txs.push(tx);
      }

      if (!txs.length) {
        renderError('PDF ішінен операцияларды тану мүмкін болмады.');
        return;
      }

      const data = analyzeTransactions(txs);
      renderResult({
        ...data,
        sourceSummary: { parsedTransactions: txs.length, preview: txs.slice(0, 10) }
      });
    } catch (e) {
      console.error(e);
      renderError(`PDF талдау сәтсіз өтті: ${e.message || 'қате'}`);
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = originalText;
    }
  });
}

