const storageKey = "logger_web_identique_v1";
const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
const defaults = {
  screen: "global",
  dayTitle: "Aujourd’hui",
  date: "Jeudi 1 octobre",
  food: 0,
  expense: 1857.5,
  deficitGoal: 800,
  meals: [
    ["Poulet riz", "Poulet 150 g · Riz cuit 180 g", 512],
    ["Fromage blanc", "Skyr 250 g · Fruits rouges 80 g", 211],
    ["Extra", "Calories à estimer plus tard", null]
  ],
  steps: 0,
  sport: 0,
  measurements: { Cou: "", Poitrine: "", Taille: "", Hanches: "0,5", Bras: "", Cuisse: "", Mollet: "" },
  zone: "Hanches"
};

const data = { ...defaults, ...stored, measurements: { ...defaults.measurements, ...(stored.measurements || {}) } };
const screen = document.querySelector("#screen");
const tabs = [...document.querySelectorAll(".tab")];
const sheet = document.querySelector("#sheet");
const save = () => localStorage.setItem(storageKey, JSON.stringify(data));
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const n = value => nf.format(Number(value) || 0);

function setScreen(name) {
  data.screen = name;
  save();
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.screen === name));
  document.querySelector("#fab").style.display = name === "meals" ? "block" : "none";
  ({ global: renderGlobal, meals: renderMeals, measurements: renderMeasurements, activity: renderActivity })[name]();
}

function renderGlobal() {
  const net = data.food - data.expense;
  const deficit = -net;
  const achieved = deficit >= data.deficitGoal;
  screen.innerHTML = `
    <h1>${data.dayTitle}</h1>
    <p class="subtitle">${data.date}</p>

    <section class="card balance-card">
      <p class="section-label">Bilan calorique</p>
      <span class="period-chip">Moyenne quotidienne · 7 jours glissants · 1/7 renseignés</span>
      <div class="net">${net > 0 ? "+" : ""}${n(net)} kcal</div>
      <p class="balance-status">${net < 0 ? "Déficit quotidien moyen" : "Surplus quotidien moyen"}</p>
      <button class="goal-chip" id="goal" type="button">Objectif ${data.deficitGoal} kcal/j ${achieved ? "atteint · +" + n(deficit - data.deficitGoal) : "· reste " + n(data.deficitGoal - deficit)} kcal · modifier</button>
      <p class="cum-deficit">Déficit cumulé - ${n(deficit)} kcal - objectif ${n(data.deficitGoal * 7)} kcal</p>
    </section>

    <div class="stat-row">
      <section class="card stat-card">
        <p class="label">Apport moyen</p>
        <p class="value pink">${n(data.food)} kcal</p>
      </section>
      <section class="card stat-card info-card">
        <span class="info-dot">ⓘ</span>
        <p class="label">Dépense moyenne</p>
        <p class="value green">${n(data.expense)} kcal</p>
      </section>
    </div>

    <h2 class="section-title">Apport et dépense</h2>
    <p class="legend">Apport (rose, base) · Dépense (vert, haut)</p>
    <section class="card chart-card">
      <div class="dash-50"><span>50 %</span></div>
      <div class="bars">
        <div class="bar-group">
          <span class="bar-label">-48 kcal</span>
          <i class="bar food"></i>
          <i class="bar expense" style="height:146px"></i>
          <span class="bar-date">30/09</span>
        </div>
        <div class="bar-group">
          <span class="bar-label">-${Math.round(data.expense)} kcal</span>
          <i class="bar expense"></i>
          <span class="bar-date">01/10 *</span>
        </div>
      </div>
    </section>
    <p class="note">Glisser pour parcourir les jours · * Données incomplètes</p>
    <p class="note">Dépense = métabolisme + activité sportive</p>
    <p class="note">Toutes les entrées du jour sont comptabilisées.</p>

    <p class="section-label" style="margin-top:24px">Journées terminées</p>
    <p class="note">Appui long sur une journée pour la modifier</p>
    <section class="card history-card">La journée apparaîtra ici une fois terminée.</section>
    <button class="export-btn" type="button">Exporter toutes mes données (.csv)</button>
  `;
  document.querySelector("#goal").onclick = openGoalSheet;
}

function renderMeals() {
  screen.innerHTML = `
    <h1>Repas</h1>
    <p class="subtitle">Catalogue rapide et entrées du jour</p>
    <section class="card meal-card">
      ${data.meals.map((meal, index) => `
        <article class="meal-row">
          <div>
            <h3>${meal[0]}</h3>
            <p>${meal[1]}${meal[2] ? " · " + meal[2] + " kcal" : ""}</p>
          </div>
          <button class="small-add" data-add-meal="${index}" type="button">+</button>
        </article>
      `).join("")}
    </section>
    <section class="card meal-card">
      <p class="section-label">Bilan du jour</p>
      <p class="value pink" style="font-size:40px;margin:12px 0 0">${n(data.food)} kcal</p>
    </section>
  `;
  screen.querySelectorAll("[data-add-meal]").forEach(button => {
    button.onclick = () => {
      const meal = data.meals[Number(button.dataset.addMeal)];
      data.food += Number(meal[2]) || 0;
      save();
      setScreen("global");
    };
  });
}

function renderMeasurements() {
  const zones = Object.keys(data.measurements);
  screen.innerHTML = `
    <h1>Mensurations</h1>
    <p class="subtitle">Enregistre tes mesures en centimètres</p>
    <section class="card measure-figure">
      <div class="silhouette">◯</div>
      <div class="selected-zone">${data.zone} sélectionnée</div>
    </section>
    <div class="chip-row">
      ${zones.slice(0, 4).map(zone => `<button class="zone-chip ${zone === data.zone ? "active" : ""}" data-zone="${zone}" type="button">${zone.toUpperCase()}</button>`).join("")}
    </div>
    <div class="measure-editor">
      <button class="round-btn" id="minus" type="button">−</button>
      <input class="measure-input" id="measure" inputmode="decimal" value="${data.measurements[data.zone] || ""}" placeholder="0">
      <strong>cm</strong>
      <button class="round-btn" id="plus" type="button">+</button>
    </div>
    <h2 class="section-title">Récapitulatif</h2>
    <p class="legend">${zones.map(zone => `${zone}  ·  ${data.measurements[zone] ? data.measurements[zone] + " cm" : "—"}`).join("<br>")}</p>
  `;
  screen.querySelectorAll("[data-zone]").forEach(button => {
    button.onclick = () => {
      data.zone = button.dataset.zone;
      save();
      renderMeasurements();
    };
  });
  const current = () => parseFloat((data.measurements[data.zone] || "0").replace(",", ".")) || 0;
  const update = value => {
    data.measurements[data.zone] = String(value).replace(".", ",");
    save();
    renderMeasurements();
  };
  document.querySelector("#measure").onchange = event => update(event.target.value);
  document.querySelector("#minus").onclick = () => update(Math.max(0, current() - .5).toLocaleString("fr-FR"));
  document.querySelector("#plus").onclick = () => update((current() + .5).toLocaleString("fr-FR"));
}

function renderActivity() {
  const stepKcal = data.steps * .04;
  screen.innerHTML = `
    <h1>Activité</h1>
    <p class="subtitle">${data.date}</p>
    <section class="card meal-card">
      <label>Pas
        <input id="steps" type="number" inputmode="numeric" value="${data.steps || ""}" placeholder="0">
      </label>
      <label style="margin-top:14px">Sport manuel (kcal)
        <input id="sport" type="number" inputmode="decimal" value="${data.sport || ""}" placeholder="0">
      </label>
      <button class="export-btn" id="save-activity" type="button">Enregistrer</button>
    </section>
    <div class="stat-row">
      <section class="card stat-card"><p class="label">Pas</p><p class="value green">${n(data.steps)}</p></section>
      <section class="card stat-card"><p class="label">Activité</p><p class="value green">${n(stepKcal + Number(data.sport || 0))} kcal</p></section>
    </div>
    <section class="card history-card">Aucun fichier .fit importé</section>
  `;
  document.querySelector("#save-activity").onclick = () => {
    data.steps = Number(document.querySelector("#steps").value) || 0;
    data.sport = Number(document.querySelector("#sport").value) || 0;
    data.expense = 1857.5 + data.steps * .04 + data.sport;
    save();
    renderActivity();
  };
}

function openGoalSheet() {
  document.querySelector("#sheet-title").textContent = "Objectif de déficit quotidien";
  document.querySelector("#sheet-body").innerHTML = `<label>Objectif kcal/j<input id="goal-input" type="number" value="${data.deficitGoal}"></label>`;
  sheet.showModal();
  document.querySelector("#sheet-save").onclick = () => {
    data.deficitGoal = Number(document.querySelector("#goal-input").value) || 800;
    save();
    sheet.close();
    renderGlobal();
  };
}

function openMealSheet() {
  document.querySelector("#sheet-title").textContent = "Ajouter un repas";
  document.querySelector("#sheet-body").innerHTML = `
    <label>Nom<input id="meal-name" value="Nouveau repas"></label>
    <label>Calories<input id="meal-kcal" type="number" value="450"></label>
  `;
  sheet.showModal();
  document.querySelector("#sheet-save").onclick = () => {
    data.meals.unshift([document.querySelector("#meal-name").value || "Nouveau repas", "Repas personnalisé", Number(document.querySelector("#meal-kcal").value) || 0]);
    save();
    sheet.close();
    renderMeals();
  };
}

tabs.forEach(tab => tab.onclick = () => setScreen(tab.dataset.screen));
document.querySelector("#fab").onclick = openMealSheet;
setScreen(data.screen || "global");
