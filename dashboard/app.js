// Token Radar dashboard — renders window.RADAR (board.json's rows, the live
// tokens and the category multiples) with search, filters, sorting, tabs and
// a per-protocol detail view that recomputes the implied value from the
// snapshot's own figures.
(function () {
  var D = window.RADAR;
  var rows = D.rows.slice();
  var $ = function (id) { return document.getElementById(id); };
  var fmt$ = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var fmtCompact = function (n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    return fmt$(n);
  };
  var fmtPct = function (v) {
    if (v === null || v === undefined) return "—";
    var s = (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
    return '<span class="' + (v >= 0 ? "up" : "down") + '">' + s + "</span>";
  };
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  // Header + lede + leaders.
  $("asof").textContent = "Snapshot " + D.as_of;
  $("src").textContent = D.source.replace(/^DefiLlama\s+/, "");
  $("lede").innerHTML =
    "<b>" + rows.length + " pre-token protocols ranked</b> — " +
    D.watchlist_count + " on the house watchlist (TVL $50M+, no token recorded) and " +
    D.early_count + " more found early below the floor. " +
    "Rank 1 carries the largest implied launch value; every row below it is worth less, by construction.";
  $("leaders").innerHTML = rows.slice(0, 3).map(function (r, i) {
    var why = i === 0 ? "Largest TVL × multiple on the board."
      : i === 1 ? "Second by implied value, close behind the leader."
      : "Third — still ahead of " + (rows.length - 3) + " other pre-token protocols.";
    return '<article class="leader" data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<span class="pos">RANK ' + r.rank + "</span><h3>" + esc(r.name) + "</h3>" +
      '<div class="val">' + fmt$(r.implied_value_usd) + "</div>" +
      '<p class="why">' + why + " TVL " + fmtCompact(r.tvl_usd) + " · " +
      esc(r.category || "Uncategorised") + ".</p></article>";
  }).join("");

  // Filter option lists.
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $("cat").appendChild(new Option(c, c)); });
  chains.forEach(function (c) { $("chain").appendChild(new Option(c, c)); });

  var sortKey = "rank", sortDir = 1;
  var state = { tab: "board" };

  function filtered() {
    var q = $("q").value.trim().toLowerCase();
    var cat = $("cat").value, ch = $("chain").value, wl = $("wl").checked;
    var out = rows.filter(function (r) {
      if (q && (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (wl && !r.watchlist) return false;
      return true;
    });
    var k = sortKey;
    out.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      var d = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return d * sortDir;
    });
    return out;
  }

  function renderBoard() {
    var list = filtered();
    $("count").textContent = list.length + " of " + rows.length + " rows";
    $("rows").innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + "</td>" +
        "<td><strong>" + esc(r.name) + "</strong></td>" +
        "<td>" + esc(r.category || "—") + "</td>" +
        '<td class="num">' + fmtCompact(r.tvl_usd) + "</td>" +
        '<td class="num">' + fmtPct(r.change_7d) + "</td>" +
        '<td class="num">' + (r.age_days === null ? "—" : r.age_days + "d") + "</td>" +
        '<td class="num"><strong>' + fmt$(r.implied_value_usd) + "</strong></td>" +
        '<td>' + (r.watchlist
          ? '<span class="pill wl">Watchlist</span>'
          : '<span class="pill pre">Pre-token</span>') + "</td></tr>";
    }).join("");
  }

  function renderLive() {
    $("live-rows").innerHTML = D.live.map(function (p, i) {
      var ratio = p.tvl_usd > 0 ? (p.mcap_usd / p.tvl_usd).toFixed(2) : "—";
      return "<tr><td class=\"num\">" + (i + 1) + "</td><td><strong>" + esc(p.name) + "</strong></td>" +
        "<td>" + esc(p.category || "—") + "</td>" +
        '<td class="num">' + fmtCompact(p.tvl_usd) + "</td>" +
        '<td class="num">' + fmtPct(p.change_7d) + "</td>" +
        '<td class="num">' + fmtCompact(p.mcap_usd) + "</td>" +
        '<td class="num">' + ratio + "</td></tr>";
    }).join("");
  }

  function renderComps() {
    $("comp-rows").innerHTML = D.categories.map(function (c) {
      return "<tr><td>" + esc(c.category) + "</td>" +
        '<td class="num"><strong>' + c.comp.toFixed(4) + "</strong></td>" +
        '<td class="num">' + c.live_count + "</td>" +
        '<td class="num">' + c.median_ratio.toFixed(4) + "</td></tr>";
    }).join("");
  }

  // Detail view: the equation, why it ranks here, the recompute, the farm plan.
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) r = rows[i];
    if (!r) return;
    var recomputed = Math.max(1, Math.round(
      r.tvl_usd * r.comp * r.growth * r.maturity * r.chains_mult));
    var above = rows.length - r.rank;
    var why = "Rank " + r.rank + " of " + rows.length + ": " +
      "its TVL of " + fmtCompact(r.tvl_usd) +
      " times a " + (r.category || "uncategorised") + " multiple of " + r.comp.toFixed(4) +
      ", growth " + r.growth.toFixed(2) + "×, maturity " + r.maturity.toFixed(2) +
      "× and chains " + r.chains_mult.toFixed(2) + "× puts it ahead of " + above +
      " other pre-token protocols" +
      (r.watchlist ? ", and it is on the house watchlist." : " — it was found early, below the watchlist floor.");
    $("detail-body").innerHTML =
      '<div class="d-head"><div><h2>' + esc(r.name) + "</h2>" +
      "<p class=\"hint\">" + esc(r.category || "Uncategorised") + " · " +
      esc(r.chains.join(", ")) + " · Rank " + r.rank + " of " + rows.length +
      (r.watchlist ? " · Watchlist" : " · Early find") + "</p></div>" +
      '<div class="val">' + fmt$(r.implied_value_usd) + '</div></div>' +
      '<div class="d-body"><h3>Why this ranks here</h3><p>' + esc(why) + "</p>" +
      "<h3>Implied value, worked out</h3>" +
      '<div class="math">' + fmtCompact(r.tvl_usd) + " TVL × " + r.comp.toFixed(4) +
      " comp × " + r.growth.toFixed(4) + " growth × " + r.maturity.toFixed(4) +
      " maturity × " + r.chains_mult.toFixed(2) + " chains<br>= " + fmt$(recomputed) + "</div>" +
      '<p class="same">Recomputed from the snapshot&rsquo;s own figures: ' +
      fmt$(recomputed) + " — the same number board.json carries.</p>" +
      "<h3>Farm plan — six steps</h3><ol>" +
      r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      '</ol><button class="close-x" id="d-close">Close</button></div>';
    var dlg = $("detail");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    $("d-close").addEventListener("click", function () { dlg.close(); });
  }

  // Events: filters, sorting, tabs, row clicks, deep links.
  ["q", "cat", "chain", "wl"].forEach(function (id) {
    $(id).addEventListener("input", renderBoard);
    $(id).addEventListener("change", renderBoard);
  });
  document.querySelectorAll("#board th[data-k]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-k");
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = k === "name" || k === "category" ? 1 : -1; }
      document.querySelectorAll("#board th[data-k]").forEach(function (x) {
        x.classList.remove("asc", "desc");
      });
      th.classList.add(sortDir === 1 ? "asc" : "desc");
      renderBoard();
    });
  });
  function setTab(tab) {
    state.tab = tab;
    $("tab-board").setAttribute("aria-selected", tab === "board" ? "true" : "false");
    $("tab-live").setAttribute("aria-selected", tab === "live" ? "true" : "false");
    $("board-pane").hidden = tab !== "board";
    $("live-pane").hidden = tab !== "live";
  }
  $("tab-board").addEventListener("click", function () { setTab("board"); });
  $("tab-live").addEventListener("click", function () { setTab("live"); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-slug]");
    if (t) openDetail(t.getAttribute("data-slug"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("leader")) {
      openDetail(e.target.getAttribute("data-slug"));
    }
  });

  // Deep links for deterministic screenshots: ?detail=<slug>, ?watchlist=1,
  // ?category=<name>, ?chain=<name>, ?q=<text>, ?tab=live.
  var params = new URLSearchParams(window.location.search);
  if (params.get("watchlist") === "1") $("wl").checked = true;
  if (params.get("category")) $("cat").value = params.get("category");
  if (params.get("chain")) $("chain").value = params.get("chain");
  if (params.get("q")) $("q").value = params.get("q");
  if (params.get("tab") === "live") setTab("live");

  renderBoard();
  renderLive();
  renderComps();
  if (params.get("detail")) openDetail(params.get("detail"));
})();
