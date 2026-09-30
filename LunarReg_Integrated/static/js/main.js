(function () {
  const $ = (id) => document.getElementById(id);
  const homeView = $('home-view');
  const dashView = $('dashboard-view');
  const startMatchBtn = $('start-matching');
  const results = $('results');
  const errBox = $('error-banner');
  const errText = $('error-text');
  const outImg = $('output-img');
  const fixedInput = $('fixed-input');
  const movingInput = $('moving-input');

  let outputs = {};          // {registered, overlay, matches} -> URLs
  let currentView = 'registered';

  /* ---------- view switching ---------- */
  $('start-registration').addEventListener('click', () => {
    homeView.classList.add('hidden');
    dashView.classList.remove('hidden');
    window.scrollTo(0, 0);
  });
  $('back-home').addEventListener('click', () => {
    dashView.classList.add('hidden');
    homeView.classList.remove('hidden');
    window.scrollTo(0, 0);
  });

  /* ---------- upload previews ---------- */
  function wireUpload(boxId, input) {
    const box = $(boxId);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        box.classList.add('has-image');
        box.innerHTML = '';
        const img = document.createElement('img');
        img.alt = file.name;
        img.onerror = () => {   // e.g. TIFF: browsers can't preview it
          img.remove();
          const s = document.createElement('span');
          s.className = 'up-label';
          s.textContent = file.name;
          box.insertBefore(s, input);
        };
        img.src = e.target.result;
        box.appendChild(img);
        box.appendChild(input);
      };
      reader.readAsDataURL(file);
    });
  }
  wireUpload('fixed-box', fixedInput);
  wireUpload('moving-box', movingInput);

  /* ---------- error banner ---------- */
  function showError(msg) {
    errText.textContent = msg;
    errBox.classList.remove('hidden');
  }
  function clearError() { errBox.classList.add('hidden'); errText.textContent = ''; }

  /* ---------- result rendering ---------- */
  const STAT_ORDER = [
    ['RMSE (px)', 'RMSE', 'lower is better'],
    ['Inliers', 'Inlier matches', 'higher is better'],
    ['Inlier ratio (%)', 'Inlier ratio', 'higher is better', '%'],
    ['Median error (px)', 'Median error', ''],
    ['Max error (px)', 'Max error', ''],
    ['Match coverage (%)', 'Match coverage', '5×5 grid cells hit', '%'],
    ['Candidate matches', 'Candidate matches', 'after ratio test'],
    ['NMI', 'NMI', 'higher is better'],
    ['NCC', 'NCC', 'higher is better'],
    ['SSIM', 'SSIM', 'higher is better'],
    ['Edge overlap (%)', 'Edge overlap', 'within 2 px', '%'],
  ];

  function renderStats(m) {
    const grid = $('stat-grid');
    grid.innerHTML = '';
    STAT_ORDER.forEach(([key, label, hint, suffix]) => {
      if (!(key in m)) return;
      const unit = suffix || (key.includes('(px)') ? ' px' : '');
      const card = document.createElement('div');
      card.className = 'stat-card';
      const v = document.createElement('div');
      v.className = 'stat-value';
      v.textContent = m[key] + unit;
      const l = document.createElement('div');
      l.className = 'stat-label';
      l.textContent = label + (hint ? ' (' + hint + ')' : '');
      card.append(v, l);
      grid.appendChild(card);
    });
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  // points: [[x, y, err], ...] with x, y normalised to 0..1 (reference frame)
  function renderErrorHeatmap(points) {
    const N = 5, W = 200, H = 90, cw = W / N, ch = H / N;
    const sum = Array(N * N).fill(0), cnt = Array(N * N).fill(0);
    points.forEach(([x, y, e]) => {
      const c = Math.min(N - 1, Math.floor(x * N)), r = Math.min(N - 1, Math.floor(y * N));
      sum[r * N + c] += e; cnt[r * N + c]++;
    });
    const means = sum.map((s, i) => (cnt[i] ? s / cnt[i] : null));
    const vals = means.filter((v) => v !== null);
    const max = Math.max(...vals, 1e-6);
    const svg = svgEl('svg', { width: '100%', height: 90, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
    svg.appendChild(svgEl('rect', { width: W, height: H, fill: '#F1EFEC' }));
    means.forEach((v, i) => {
      const r = Math.floor(i / N), c = i % N;
      let fill = '#E6E1DC';                       // no inliers in this cell
      if (v !== null) {
        const t = v / max;                        // 0 = good, 1 = worst cell
        fill = t < 0.34 ? '#CFE3D2' : t < 0.67 ? '#EAD7C4' : '#F3B99C';
      }
      const rect = svgEl('rect', { x: c * cw + 1, y: r * ch + 1, width: cw - 2, height: ch - 2, fill });
      const t = svgEl('title', {});
      t.textContent = v === null ? 'no inliers' : v.toFixed(3) + ' px';
      rect.appendChild(t);
      svg.appendChild(rect);
    });
    const box = $('error-heatmap'); box.innerHTML = ''; box.appendChild(svg);
  }

  function renderUniformity(points) {
    const W = 200, H = 90;
    const svg = svgEl('svg', { width: '100%', height: 90, viewBox: `0 0 ${W} ${H}` });
    svg.appendChild(svgEl('rect', { width: W, height: H, fill: '#F1EFEC' }));
    points.forEach(([x, y]) => {
      svg.appendChild(svgEl('circle', { cx: 6 + x * (W - 12), cy: 6 + y * (H - 12), r: 2.2, fill: '#3D4C7D', 'fill-opacity': 0.75 }));
    });
    const box = $('uniformity-plot'); box.innerHTML = ''; box.appendChild(svg);
  }

  function setView(name) {
    currentView = name;
    document.querySelectorAll('.view-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (outputs[name]) outImg.src = outputs[name];
  }
  document.querySelectorAll('.view-tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  /* ---------- download ---------- */
  $('download-result').addEventListener('click', () => {
    if (!outputs.registered) return;
    const a = document.createElement('a');
    a.href = outputs.registered.split('?')[0] + '?download=1';
    a.download = 'lunarreg-registered-image.png';
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- run registration against the Flask backend ---------- */
  startMatchBtn.addEventListener('click', async () => {
    clearError();
    const fixed = fixedInput.files && fixedInput.files[0];
    const moving = movingInput.files && movingInput.files[0];
    if (!fixed || !moving) {
      showError('Please select both a fixed image and a moving image.');
      return;
    }

    const originalHTML = startMatchBtn.innerHTML;
    startMatchBtn.disabled = true;
    startMatchBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing…';

    const fd = new FormData();
    fd.append('reference', fixed);   // fixed image  = reference frame
    fd.append('source', moving);     // moving image = source, warped onto the reference

    try {
      const resp = await fetch('/register', { method: 'POST', body: fd });
      let data;
      try { data = await resp.json(); }
      catch (_) { throw new Error('Server error (' + resp.status + '). Check the terminal running app.py.'); }
      if (!resp.ok || !data.success) throw new Error(data.error || data.message || 'Registration failed.');

      const bust = '?t=' + Date.now();
      outputs = {
        registered: data.registered + bust,
        overlay: data.overlay + bust,
        matches: data.matches + bust,
      };
      renderStats(data.metrics);
      renderErrorHeatmap(data.points || []);
      renderUniformity(data.points || []);
      setView('registered');

      results.classList.remove('hidden');
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      showError(e.message);
    } finally {
      startMatchBtn.disabled = false;
      startMatchBtn.innerHTML = originalHTML;
    }
  });
})();
