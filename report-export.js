/* NurseCall Cloud · Professional CSV / Excel export. No external dependencies. */
(function (root) {
  'use strict';

  const TZ = 'Asia/Ho_Chi_Minh';
  const STATION = 'Trạm y tá trung tâm';
  const DATE_FIELDS = new Set([
    'called_at', 'accepted_at', 'arrived_at', 'completed_at', 'cancelled_at',
    'measured_at', 'started_at', 'ended_at', 'last_seen_at'
  ]);
  const NUMERIC_FIELDS = new Set([
    'total_calls', 'emergency_calls', 'completed_calls',
    'avg_accept_seconds', 'total_samples', 'abnormal_samples',
    'silence_minutes', 'bpm', 'temp_c', 'bp_sys', 'bp_dia', 'minutes',
    'accept_seconds', 'completion_rate'
  ]);
  const FLAG_FIELDS = new Set(['hr_alert', 'temp_alert', 'bp_alert', 'mode_alert']);

  const REPORTS = {
    beds: {
      slug: 'Thong_ke_theo_giuong',
      title: 'BÁO CÁO THỐNG KÊ THEO GIƯỜNG',
      sheet: 'Thống kê giường',
      columns: [
        ['floor', 'Tầng', 12], ['room', 'Phòng', 14], ['bed', 'Giường', 14],
        ['total_calls', 'Tổng cuộc gọi', 18],
        ['emergency_calls', 'Khẩn cấp', 16],
        ['completed_calls', 'Hoàn thành', 16],
        ['completion_rate', 'Hoàn thành (%)', 19],
        ['avg_accept_seconds', 'Tiếp nhận TB (giây)', 21],
        ['total_samples', 'Tổng mẫu đo', 16],
        ['abnormal_samples', 'Mẫu bất thường', 19],
        ['silence_minutes', 'Gián đoạn (phút)', 20],
        ['node_status', 'Trạng thái node', 22],
        ['last_seen_at', 'Lần nhận tín hiệu cuối', 24]
      ]
    },
    abnormal: {
      slug: 'Chi_so_bat_thuong',
      title: 'BÁO CÁO CHỈ SỐ BẤT THƯỜNG',
      sheet: 'Chỉ số bất thường',
      columns: [
        ['measured_at', 'Thời gian ghi nhận', 24],
        ['floor', 'Tầng', 12], ['room', 'Phòng', 14], ['bed', 'Giường', 14],
        ['device_uid', 'Mã thiết bị', 24],
        ['bpm', 'Nhịp tim (bpm)', 18], ['temp_c', 'Nhiệt độ (°C)', 19],
        ['bp_sys', 'Tâm thu (mmHg)', 19], ['bp_dia', 'Tâm trương (mmHg)', 22],
        ['mode', 'Chế độ', 18], ['alert_types', 'Chỉ số vượt ngưỡng', 34]
      ]
    },
    outages: {
      slug: 'Gian_doan_ket_noi',
      title: 'BÁO CÁO GIÁN ĐOẠN KẾT NỐI',
      sheet: 'Gián đoạn',
      columns: [
        ['device_id', 'Thiết bị', 28], ['kind', 'Loại thiết bị', 18],
        ['started_at', 'Bắt đầu', 23], ['ended_at', 'Khôi phục', 23],
        ['minutes', 'Thời lượng (phút)', 22],
        ['outage_state', 'Tình trạng', 22],
        ['source', 'Nguồn ghi nhận', 31]
      ]
    },
    calls: {
      slug: 'Chi_tiet_cuoc_goi',
      title: 'BÁO CÁO CHI TIẾT CUỘC GỌI',
      sheet: 'Lịch sử cuộc gọi',
      columns: [
        ['floor', 'Tầng', 12], ['room', 'Phòng', 14], ['bed', 'Giường', 14],
        ['call_type', 'Loại cuộc gọi', 19], ['status', 'Trạng thái xử lý', 22],
        ['called_at', 'Thời điểm gọi', 23], ['accepted_at', 'Tiếp nhận', 23],
        ['arrived_at', 'Đã đến giường', 23], ['completed_at', 'Hoàn thành', 23],
        ['cancelled_at', 'Hủy lúc', 23],
        ['accept_seconds', 'Phản hồi (giây)', 19]
      ]
    }
  };

  const STATUSES = {
    READY: 'Sẵn sàng', PENDING: 'Chờ tiếp nhận',
    ACCEPTED: 'Đã tiếp nhận', ARRIVED: 'Đã đến',
    COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy',
    NORMAL: 'Gọi thường', EMERGENCY: 'Khẩn cấp',
    ONLINE: 'Đang kết nối', OFFLINE: 'Mất kết nối',
    UNKNOWN: 'Chưa xác định',
    ABNORMAL: 'Bất thường', SIMULATED: 'Mô phỏng',
    cloud_gap: 'Gián đoạn kết nối Cloud',
    ongoing: 'Đang mất kết nối',
    heartbeat_gap: 'Gián đoạn heartbeat',
    pi: 'Raspberry Pi 4', node: 'Node giường'
  };

  function localizedTime(value) {
    if (!value) return '';
    const dt = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(dt.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(dt);
  }

  function cellValue(row, key) {
    if (key === 'completion_rate') {
      const calls = Number(row.total_calls);
      const done = Number(row.completed_calls);
      return Number.isFinite(calls) && calls > 0 && Number.isFinite(done)
        ? Math.round(done * 1000 / calls) / 10 : '';
    }
    if (key === 'alert_types') {
      const terms = [];
      if (row.hr_alert === true || row.hr_alert === 1) terms.push('Nhịp tim');
      if (row.temp_alert === true || row.temp_alert === 1) terms.push('Nhiệt độ');
      if (row.bp_alert === true || row.bp_alert === 1) terms.push('Huyết áp');
      if (row.mode_alert === true || row.mode_alert === 1) terms.push('Chế độ mô phỏng');
      return terms.join(', ');
    }
    if (key === 'outage_state') return row.ended_at ? 'Đã khôi phục' : 'Chưa khôi phục';
    if (key === 'mode' && String(row.mode).toUpperCase() === 'NORMAL') return 'Bình thường';
    const raw = row[key];
    if (raw === null || raw === undefined || raw === '') return '';
    if (DATE_FIELDS.has(key)) {
      const dt = new Date(raw);
      return Number.isFinite(dt.getTime()) ? dt : '';
    }
    if (NUMERIC_FIELDS.has(key)) {
      const val = Number(raw);
      return Number.isFinite(val) ? val : '';
    }
    if (FLAG_FIELDS.has(key)) return raw === true || raw === 1 || raw === 'true' ? 'Có' : 'Không';
    const label = String(raw);
    return Object.prototype.hasOwnProperty.call(STATUSES, label)
      ? STATUSES[label] : Object.prototype.hasOwnProperty.call(STATUSES, label.toUpperCase())
        ? STATUSES[label.toUpperCase()] : label;
  }

  function orderedRows(kind, rows) {
    const copy = [...rows];
    if (kind === 'beds') {
      const cmp = new Intl.Collator('vi', {numeric: true, sensitivity: 'base'});
      return copy.sort((a, b) =>
        cmp.compare(String(a.floor ?? ''), String(b.floor ?? '')) ||
        cmp.compare(String(a.room ?? ''), String(b.room ?? '')) ||
        cmp.compare(String(a.bed ?? ''), String(b.bed ?? '')));
    }
    const field = kind === 'abnormal' ? 'measured_at'
      : kind === 'outages' ? 'started_at' : 'called_at';
    return copy.sort((a, b) =>
      (Date.parse(b[field] || '') || 0) - (Date.parse(a[field] || '') || 0));
  }

  function safeCsvText(value) {
    let text = String(value).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function csvCell(value) {
    if (value === null || value === undefined || value === '') return '""';
    if (value instanceof Date) return safeCsvText(localizedTime(value));
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value).replace('.', ',') : '""';
    }
    return safeCsvText(value);
  }

  function filename(kind, format, days) {
    const dt = new Date();
    const stamp = [
      new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric',month:'2-digit',day:'2-digit'}).format(dt),
      ('0' + dt.getHours()).slice(-2) + ('0' + dt.getMinutes()).slice(-2)
    ].join('_');
    return 'NurseCall_' + REPORTS[kind].slug + '_' + days + 'ngay_' + stamp + '.' + format;
  }

  function download(bytes, mime, name) {
    const blob = new Blob([bytes], {type: mime});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function csvContent(kind, rows) {
    const columns = REPORTS[kind].columns;
    const header = columns.map(c => safeCsvText(c[1])).join(';');
    const entries = orderedRows(kind, rows).map(row =>
      columns.map(c => csvCell(cellValue(row, c[0]))).join(';'));
    return '\uFEFFsep=;\r\n' + [header, ...entries].join('\r\n') + '\r\n';
  }

  function xmlEscape(value) {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(index) {
    let col = '';
    for (let x = index + 1; x > 0; x = Math.floor((x - 1) / 26)) {
      col = String.fromCharCode(65 + (x - 1) % 26) + col;
    }
    return col;
  }
  function excelSerial(date) {
    return (date.getTime() + 7 * 3600000) / 86400000 + 25569;
  }
  function xCell(value, addr, style) {
    if (value === null || value === undefined || value === '') return '';
    if (value instanceof Date) {
      return '<c r="' + addr + '" s="' + (style === 6 ? 10 : 9) +
        '"><v>' + excelSerial(value) + '</v></c>';
    }
    if (typeof value === 'number') {
      return '<c r="' + addr + '" s="' + (style === 6 ? 8 : 7) +
        '"><v>' + value + '</v></c>';
    }
    return '<c r="' + addr + '" s="' + style +
      '" t="inlineStr"><is><t xml:space="preserve">' +
      xmlEscape(value) + '</t></is></c>';
  }
  function xmlRow(i, values, style, height) {
    const cells = values.map((val, j) => xCell(val, colName(j) + i, style)).join('');
    return '<row r="' + i + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') +
      '>' + cells + '</row>';
  }

  const STYLES = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"dd/mm/yyyy hh:mm\"/></numFmts><fonts count=\"5\"><font><sz val=\"11\"/><name val=\"Calibri\"/><color rgb=\"FF263646\"/></font><font><b/><sz val=\"16\"/><name val=\"Calibri\"/><color rgb=\"FFFFFFFF\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/><color rgb=\"FFFFFFFF\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/><color rgb=\"FF19394B\"/></font><font><i/><sz val=\"10\"/><name val=\"Calibri\"/><color rgb=\"FF718394\"/></font></fonts><fills count=\"5\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF173C4F\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF087B6C\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFF2F7F9\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style=\"hair\"><color rgb=\"FFE7EDF0\"/></bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"13\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" applyFill=\"1\" applyAlignment=\"1\"><alignment vertical=\"center\" indent=\"1\"/></xf><xf numFmtId=\"0\" fontId=\"3\" fillId=\"0\" borderId=\"0\"/><xf numFmtId=\"0\" fontId=\"4\" fillId=\"0\" borderId=\"0\"/><xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"1\" applyFill=\"1\" applyAlignment=\"1\"><alignment vertical=\"center\" wrapText=\"1\"/></xf><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\"/><xf numFmtId=\"0\" fontId=\"0\" fillId=\"4\" borderId=\"1\" applyFill=\"1\"/><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" applyAlignment=\"1\"><alignment horizontal=\"right\"/></xf><xf numFmtId=\"0\" fontId=\"0\" fillId=\"4\" borderId=\"1\" applyAlignment=\"1\" applyFill=\"1\"><alignment horizontal=\"right\"/></xf><xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"1\" applyNumberFormat=\"1\"/><xf numFmtId=\"164\" fontId=\"0\" fillId=\"4\" borderId=\"1\" applyNumberFormat=\"1\" applyFill=\"1\"/><xf numFmtId=\"0\" fontId=\"4\" fillId=\"0\" borderId=\"0\"/><xf numFmtId=\"0\" fontId=\"3\" fillId=\"4\" borderId=\"0\" applyFill=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";

  function sheetXml(kind, rows, days) {
    const spec = REPORTS[kind], cols = spec.columns;
    const total = cols.length, last = colName(total - 1);
    const start = new Date(Date.now() - days * 86400000);
    const sorted = orderedRows(kind, rows);
    const times = localizedTime(start) + ' - ' + localizedTime(new Date());
    const lines = [];
    lines.push(xmlRow(1, [spec.title], 1, 36));
    lines.push(xmlRow(2, ['NURSECALL CLOUD  |  ' + STATION], 2, 23));
    lines.push(xmlRow(3, ['Kỳ báo cáo', times], 3, 22));
    lines.push(xmlRow(4, ['Thời điểm xuất', localizedTime(new Date())], 3, 22));
    lines.push(xmlRow(5, ['Nguồn dữ liệu', 'Supabase Cloud'], 3, 22));
    lines.push(xmlRow(7, ['Tổng số bản ghi', sorted.length], 12, 25));
    lines.push(xmlRow(9, cols.map(c => c[1]), 4, 32));
    sorted.forEach((row, i) =>
      lines.push(xmlRow(i + 10, cols.map(c => cellValue(row, c[0])), i % 2 ? 6 : 5, 21)));
    if (!sorted.length) lines.push(xmlRow(10, ['Không có bản ghi trong kỳ đã chọn'], 3, 25));
    const end = Math.max(10, sorted.length + 9), noteRow = end + 2;
    lines.push(xmlRow(noteRow, [kind === 'abnormal'
      ? 'Lưu ý: Chỉ số được mô phỏng, không dùng cho chẩn đoán.'
      : kind === 'outages'
      ? 'Lưu ý: Mất liên lạc không đồng nghĩa thiết bị bị tắt nguồn.'
      : 'Dữ liệu báo cáo được đồng bộ từ hệ thống NurseCall.'], 11, 24));
    const widths = cols.map((c, i) => '<col min="' + (i + 1) + '" max="' +
      (i + 1) + '" width="' + c[2] + '" customWidth="1"/>').join('');
    const merged = ['1', '2', String(noteRow)].map(n =>
      '<mergeCell ref="A' + n + ':' + last + n + '"/>').join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + last + noteRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="9" topLeftCell="A10"' +
      ' activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"' +
      ' activeCell="A10" sqref="A10"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="20"/><cols>' + widths + '</cols><sheetData>' +
      lines.join('') + '</sheetData><mergeCells count="3">' + merged +
      '</mergeCells><autoFilter ref="A9:' + last + end + '"/>' +
      '<printOptions horizontalCentered="0"/>' +
      '<pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1"/>' +
      '</worksheet>';
  }

  function zipStored(files) {
    const enc = new TextEncoder();
    const output = [], directory = [];
    let offset = 0;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let x = i;
      for (let j = 0; j < 8; j++) x = (x >>> 1) ^ (x & 1 ? 0xEDB88320 : 0);
      table[i] = x >>> 0;
    }
    function crc32(bytes) {
      let crc = 0xFFFFFFFF;
      for (const b of bytes) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xFF];
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function w16(v, p, n) { new DataView(v.buffer).setUint16(p, n, true); }
    function w32(v, p, n) { new DataView(v.buffer).setUint32(p, n >>> 0, true); }
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const [name, content] of files) {
      const fname = enc.encode(name);
      const bytes = enc.encode(content);
      const crc = crc32(bytes);
      const head = new Uint8Array(30 + fname.length);
      w32(head, 0, 0x04034b50); w16(head, 4, 20); w16(head, 6, 0x0800);
      w16(head, 8, 0); w16(head, 10, dosTime); w16(head, 12, dosDate);
      w32(head, 14, crc); w32(head, 18, bytes.length); w32(head, 22, bytes.length);
      w16(head, 26, fname.length); head.set(fname, 30);
      output.push(head, bytes);
      const central = new Uint8Array(46 + fname.length);
      w32(central, 0, 0x02014b50); w16(central, 4, 20); w16(central, 6, 20);
      w16(central, 8, 0x0800); w16(central, 10, 0); w16(central, 12, dosTime);
      w16(central, 14, dosDate); w32(central, 16, crc);
      w32(central, 20, bytes.length); w32(central, 24, bytes.length);
      w16(central, 28, fname.length); w32(central, 42, offset);
      central.set(fname, 46);
      directory.push(central);
      offset += head.length + bytes.length;
    }
    const centralSize = directory.reduce((a, b) => a + b.length, 0);
    const ending = new Uint8Array(22);
    w32(ending, 0, 0x06054b50); w16(ending, 8, files.length);
    w16(ending, 10, files.length); w32(ending, 12, centralSize);
    w32(ending, 16, offset);
    const out = new Uint8Array(offset + centralSize + ending.length);
    let pos = 0;
    for (const part of [...output, ...directory, ending]) {
      out.set(part, pos); pos += part.length;
    }
    return out;
  }

  function excelBytes(kind, rows, days) {
    const title = REPORTS[kind].sheet;
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xmlEscape(title) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'],
      ['xl/styles.xml', STYLES],
      ['xl/worksheets/sheet1.xml', sheetXml(kind, rows, days)]
    ];
    return zipStored(files);
  }

  function save(format, kind, rows, days) {
    if (!REPORTS[kind]) throw new Error('Loại báo cáo không hợp lệ');
    if (!Array.isArray(rows)) throw new Error('Dữ liệu báo cáo không hợp lệ');
    if (format === 'csv') {
      download(csvContent(kind, rows), 'text/csv;charset=utf-8', filename(kind, 'csv', days));
    } else if (format === 'xlsx') {
      download(excelBytes(kind, rows, days),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename(kind, 'xlsx', days));
    } else {
      throw new Error('Định dạng tệp không hợp lệ');
    }
    return rows.length;
  }

  root.NurseCallExport = Object.freeze({save, csvContent, excelBytes, reports: REPORTS});
})(window);
