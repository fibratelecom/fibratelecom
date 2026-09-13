const BUILD = '20260913-central-restored1';
const root = document.querySelector('#app');
let lastValidationToastAt = 0;

function showRuntimeMessage(message, kind = 'error') {
  const host = root?.querySelector('#toast-root');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.textContent = String(message || 'Falha inesperada no painel.');
  host.appendChild(toast);
  setTimeout(() => toast.remove(), kind === 'error' ? 7000 : 2500);
}

function showRuntimeError(value) {
  const error = value instanceof Error ? value : new Error(String(value || 'Falha inesperada no painel.'));
  console.error('Provedor Plus:', error);
  showRuntimeMessage(error.message || 'Falha inesperada no painel.', 'error');
}

window.addEventListener('error', (event) => {
  if (event.error) showRuntimeError(event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  showRuntimeError(event.reason);
});

root?.addEventListener('invalid', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLElement)) return;
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const now = Date.now();
  if (now - lastValidationToastAt < 700) return;
  lastValidationToastAt = now;
  const label = control.closest('label');
  const fieldName = String(label?.childNodes?.[0]?.textContent || '').trim();
  const nativeMessage = String(control.validationMessage || '').trim();
  showRuntimeError(new Error(`${fieldName ? `${fieldName}: ` : ''}${nativeMessage || 'preencha este campo corretamente antes de salvar.'}`));
}, true);

// Observa os botões sem interferir no submit nativo. A execução da regra de negócio
// continua exclusivamente no único handler submit do src/ui.js.
root?.addEventListener('click', (event) => {
  const button = event.target.closest?.('button[type="submit"]');
  if (!button) return;
  const form = button.form;
  if (!form) {
    showRuntimeError(new Error('Este botão não está vinculado ao formulário. Recarregue a página.'));
    return;
  }
  const original = button.textContent;
  button.textContent = 'Processando…';
  showRuntimeMessage(`Clique recebido · ${form.getAttribute('id') || 'formulário'}`, 'success');
  setTimeout(() => {
    if (button.isConnected && button.textContent === 'Processando…') button.textContent = original;
  }, 12000);
}, true);

function syncInvoiceReference(event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  const form = input?.closest?.('#invoice-form');
  if (!input || !(form instanceof HTMLFormElement)) return;
  const reference = form.elements?.reference;
  if (!(reference instanceof HTMLInputElement)) return;
  if (input.name === 'reference') {
    form.dataset.referenceManual = '1';
    return;
  }
  const existingId = String(form.elements?.id?.value || '').trim();
  if (!existingId && input.name === 'due_date' && form.dataset.referenceManual !== '1') {
    const month = String(input.value || '').slice(0, 7);
    if (month) reference.value = month;
  }
}

root?.addEventListener('input', syncInvoiceReference);
root?.addEventListener('change', syncInvoiceReference);

function pdfLatin(value) {
  const normalized = String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-');
  let out = '';
  for (const ch of normalized) out += ch.charCodeAt(0) <= 255 ? ch : '?';
  return out;
}

function pdfEscape(value) {
  return pdfLatin(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfFit(value, width, size = 7) {
  const text = pdfLatin(value).replace(/\s+/g, ' ').trim();
  const max = Math.max(1, Math.floor(width / Math.max(3.2, size * 0.52)));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 3))}...`;
}

function pdfText(x, y, size, value, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(value)}) Tj ET\n`;
}

function pdfRect(x, y, width, height, fill = false) {
  const body = `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`;
  return fill ? `0.94 g ${body} f 0 g ${body} S\n` : `${body} S\n`;
}

function reportDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return raw || '-';
}

function reportMoney(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function makePdfBlob(pageStreams) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const pageIds = [];
  let nextId = 5;
  pageStreams.forEach((stream) => {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    const content = pdfLatin(stream);
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
  });
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([Uint8Array.from(Array.from(pdf, (ch) => ch.charCodeAt(0) & 255))], { type: 'application/pdf' });
}

function downloadOverduePdf(report) {
  if (!(report instanceof HTMLElement)) throw new Error('Relatório de inadimplentes não encontrado.');
  const rows = [...report.querySelectorAll('[data-overdue-row]')];
  if (!rows.length) throw new Error('Não há cobranças vencidas para gerar o PDF.');
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.dataset.clientKey || row.dataset.client || 'cliente';
    if (!groups.has(key)) groups.set(key, { login: row.dataset.login || '-', client: row.dataset.client || '-', phone: row.dataset.phone || '-', address: row.dataset.address || '-', rows: [] });
    groups.get(key).rows.push({
      days: row.dataset.days || '0',
      due: reportDate(row.dataset.due),
      issued: reportDate(row.dataset.issued),
      discount: reportMoney(row.dataset.discountCents),
      value: reportMoney(row.dataset.valueCents),
    });
  });

  const width = 595.28;
  const margin = 28;
  const contentWidth = width - margin * 2;
  const clientWidths = [100, 145, 90, contentWidth - 335];
  const invoiceWidths = [78, 110, 120, 100, contentWidth - 408];
  const clientHeaders = ['Login', 'Sacado', 'Telefone', 'Endereço'];
  const invoiceHeaders = ['Dias vencidos', 'Data vencimento', 'Data emissão', 'Descontos', 'Valor'];
  const companyName = report.dataset.companyName || 'Provedor Plus';
  const companyMeta = report.dataset.companyMeta || '';
  const created = new Date();
  const generatedDate = created.toLocaleDateString('pt-BR');
  const generatedTime = created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const pages = [];
  let stream = '';
  let y = 0;

  const drawCells = (top, height, widths, values, bold = false, fill = false, size = 7) => {
    let x = margin;
    widths.forEach((cellWidth, index) => {
      stream += pdfRect(x, top - height, cellWidth, height, fill);
      stream += pdfText(x + 3, top - height + 5, size, pdfFit(values[index] ?? '', cellWidth - 6, size), bold);
      x += cellWidth;
    });
  };

  const startPage = () => {
    stream = '0 G 0 g 0.5 w\n';
    stream += pdfText(margin, 813, 10, companyName, true);
    if (companyMeta) stream += pdfText(margin, 801, 6.5, pdfFit(companyMeta, 360, 6.5));
    stream += pdfText(470, 813, 6.5, `Data ${generatedDate}`);
    stream += pdfText(470, 802, 6.5, `Hora ${generatedTime}`);
    stream += `${margin} 790 m ${width - margin} 790 l S\n`;
    stream += pdfText(225, 773, 10, 'LISTA DE INADIMPLENTES', true);
    y = 756;
  };

  const finishPage = () => {
    if (stream) pages.push(stream);
  };

  startPage();
  for (const group of groups.values()) {
    let rowIndex = 0;
    while (rowIndex < group.rows.length) {
      if (y < 118) {
        finishPage();
        startPage();
      }
      drawCells(y, 16, clientWidths, clientHeaders, true, true, 6.5);
      y -= 16;
      drawCells(y, 18, clientWidths, [group.login, group.client, group.phone, group.address], false, false, 6.5);
      y -= 22;
      drawCells(y, 16, invoiceWidths, invoiceHeaders, true, true, 6.5);
      y -= 16;
      while (rowIndex < group.rows.length && y >= 62) {
        const item = group.rows[rowIndex];
        drawCells(y, 17, invoiceWidths, [item.days, item.due, item.issued, item.discount, item.value], false, false, 6.5);
        y -= 17;
        rowIndex += 1;
      }
      y -= 8;
      if (rowIndex < group.rows.length) {
        finishPage();
        startPage();
      }
    }
  }
  finishPage();

  const totalPages = pages.length;
  const finalized = pages.map((page, index) => `${page}${pdfText(264, 20, 6.5, `Página ${index + 1} de ${totalPages}`)}`);
  const url = URL.createObjectURL(makePdfBlob(finalized));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `provedor-plus-inadimplentes-${new Date().toISOString().slice(0, 10)}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root?.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-action="export-overdue-pdf"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    downloadOverduePdf(button.closest('[data-overdue-report]'));
    showRuntimeMessage('PDF de inadimplentes gerado.', 'success');
  } catch (error) {
    showRuntimeError(error);
  }
}, true);

// Filtra localmente as tabelas de Clientes e Mensalidades. O listener fica no
// controlador externo para respeitar a CSP do painel e não gera consultas ao Neon.
root?.addEventListener('input', (event) => {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input || input.type !== 'search') return;
  const scope = input.closest('[data-table-filter-scope]');
  if (!scope) return;
  const normalize = (value) => String(value || '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const query = normalize(input.value).trim();
  scope.querySelectorAll('.table-wrap tbody tr').forEach((row) => {
    const searchable = normalize(`${row.dataset.search || ''} ${row.textContent || ''}`);
    row.hidden = Boolean(query) && !searchable.includes(query);
  });
});

// Este observador roda antes do controlador e comprova que a validação nativa liberou
// a submissão. Não cancela nem altera o evento.
root?.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form) return;
  showRuntimeMessage(`Enviando · ${form.getAttribute('id') || 'formulário'}`, 'success');
}, true);

async function refreshPanelModules() {
  const paths = ['/src/model.js', '/src/ui-kit.js', '/src/panel-forms.js', '/src/panel-views.js'];
  await Promise.all(paths.map(async (path) => {
    const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Não foi possível atualizar ${path} (HTTP ${response.status}).`);
  }));
}

async function bootstrap() {
  await refreshPanelModules();
  const [api, ui] = await Promise.all([
    import(`./src/api.js?v=${BUILD}`),
    import(`./src/ui.js?v=${BUILD}`),
  ]);
  const panel = ui.createPanel(root, api);
  await panel.start();
  const footer = root?.querySelector('.app-footer');
  if (footer && !footer.querySelector('[data-panel-build]')) {
    const mark = document.createElement('span');
    mark.dataset.panelBuild = BUILD;
    mark.textContent = `• ${BUILD}`;
    footer.appendChild(mark);
  }
}

bootstrap().catch((error) => {
  console.error('Provedor Plus:', error);
  root.innerHTML = `<main class="fatal"><section class="fatal-card"><span class="brand-mark">F+</span><h1>Provedor Plus</h1><p>Não foi possível iniciar o painel.</p><pre>${String(error?.message || error)}</pre><button id="fatal-reload" type="button">Tentar novamente</button></section></main>`;
  root.querySelector('#fatal-reload')?.addEventListener('click', () => location.reload());
});