const { apiUrl, region, clientId } = window.CONFIG;
const $ = (id) => document.getElementById(id);

let token = sessionStorage.getItem("idToken");
const state = {
  photos: [],         // lo que devuelve GET /photos
  selectedTag: null,  // null = "Todas"
  idx: 0,             // posición dentro de la lista filtrada
  view: "visor",      // "visor" | "galeria"
};

// ───── Sesión (igual que antes) ─────
function say(text) { $("msg").textContent = text; }

function showState() {
  $("login").hidden = !!token;
  $("app").hidden = !token;
  if (token) loadPhotos().catch((e) => say(e.message));
}

async function login(email, password) {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Login incorrecto");
  token = data.AuthenticationResult.IdToken;
  sessionStorage.setItem("idToken", token);
}

function logout() {
  token = null;
  sessionStorage.removeItem("idToken");
  showState();
}

async function api(path, options = {}) {
  const res = await fetch(apiUrl + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error("Sesión caducada, entra de nuevo");
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

// ───── Datos ─────
async function loadPhotos() {
  state.photos = await api("/photos");
  render();
}

function visible() {
  if (!state.selectedTag) return state.photos;
  return state.photos.filter((p) => (p.tags || []).includes(state.selectedTag));
}

function tagCounts() {
  const counts = new Map();
  for (const p of state.photos)
    for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ───── Pintado ─────
// Los tags los escribe el usuario: se insertan siempre con textContent, nunca con
// innerHTML, para no abrir la puerta a XSS (el token vive en sessionStorage).
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  // Si el tag seleccionado ya no existe (le quitaste el último), vuelve a "Todas".
  if (state.selectedTag && !tagCounts().some(([t]) => t === state.selectedTag))
    state.selectedTag = null;

  const list = visible();
  state.idx = Math.min(state.idx, Math.max(list.length - 1, 0));

  $("summary").textContent = list.length
    ? `${list.length} ${list.length === 1 ? "foto" : "fotos"}` +
      (state.selectedTag ? ` con el tag ${state.selectedTag}` : " en total")
    : "Todavía no hay fotos.";

  renderChips();
  $("visor-view").hidden = state.view !== "visor";
  $("galeria-view").hidden = state.view !== "galeria";
  $("btn-visor").classList.toggle("on", state.view === "visor");
  $("btn-galeria").classList.toggle("on", state.view === "galeria");
  if (state.view === "visor") renderVisor(list);
  else renderGrid(list);
}

function renderChips() {
  const box = $("chips");
  box.replaceChildren();
  const addChip = (label, count, on, tag) => {
    const b = el("button", "chip" + (on ? " on" : ""), label);
    b.type = "button";
    b.setAttribute("aria-pressed", on);
    b.appendChild(el("span", "count", String(count)));
    b.addEventListener("click", () => {
      state.selectedTag = tag;
      state.idx = 0;
      render();
    });
    box.appendChild(b);
  };
  addChip("Todas", state.photos.length, !state.selectedTag, null);
  for (const [name, count] of tagCounts())
    addChip(name, count, state.selectedTag === name, name);
}

function renderVisor(list) {
  const cur = list[state.idx];
  $("edit-tags").disabled = !cur;
  if (!cur) {
    $("big").removeAttribute("src");
    $("title").textContent = "";
    $("current-tags").textContent = "";
    $("counter").textContent = "";
    $("thumbs").replaceChildren();
    return;
  }
  $("big").src = cur.webUrl;
  $("title").textContent = `Foto ${cur.id.slice(0, 8)}`;
  $("current-tags").textContent = cur.tags && cur.tags.length
    ? `Tags: ${cur.tags.join(", ")}`
    : "Sin tags";
  $("counter").textContent = `${state.idx + 1} / ${list.length}`;

  // Precarga la siguiente foto grande para que el paso sea instantáneo.
  const nextPhoto = list[(state.idx + 1) % list.length];
  if (nextPhoto) new Image().src = nextPhoto.webUrl;

  const box = $("thumbs");
  box.replaceChildren();
  list.forEach((p, i) => {
    const b = el("button", i === state.idx ? "on" : "");
    b.type = "button";
    b.setAttribute("aria-label", `Ver foto ${i + 1}`);
    const img = el("img");
    img.src = p.thumbUrl;
    img.alt = "";
    img.loading = "lazy";
    b.appendChild(img);
    b.addEventListener("click", () => { state.idx = i; render(); });
    box.appendChild(b);
    if (i === state.idx)
      requestAnimationFrame(() => b.scrollIntoView({ inline: "center", block: "nearest" }));
  });
}

function renderGrid(list) {
  const box = $("grid");
  box.replaceChildren();
  list.forEach((p, i) => {
    const b = el("button");
    b.type = "button";
    b.setAttribute("aria-label", `Abrir foto ${i + 1} en el visor`);
    const img = el("img");
    img.src = p.thumbUrl;
    img.alt = "";
    img.loading = "lazy";
    b.appendChild(img);
    if (p.tags && p.tags.length) {
      const extra = p.tags.length > 1 ? ` +${p.tags.length - 1}` : "";
      b.appendChild(el("div", "badge", p.tags[0] + extra));
    }
    b.addEventListener("click", () => {
      state.idx = i;
      state.view = "visor";
      render();
    });
    box.appendChild(b);
  });
}

function go(step) {
  const n = visible().length;
  if (!n) return;
  state.idx = (state.idx + step + n) % n;
  render();
}

// ───── Editor de tags ─────
let draft = [];

function openTagEditor() {
  const cur = visible()[state.idx];
  if (!cur) return;
  draft = [...(cur.tags || [])];
  const list = $("tag-suggestions");
  list.replaceChildren();
  for (const [name] of tagCounts()) {
    const o = document.createElement("option");
    o.value = name;
    list.appendChild(o);
  }
  $("tag-input").value = "";
  $("tag-msg").textContent = "";
  paintDraft();
  $("tag-editor").showModal();
  $("tag-input").focus();
}

function paintDraft() {
  const box = $("tag-chips-edit");
  box.replaceChildren();
  if (!draft.length) box.appendChild(el("span", "muted", "Sin tags"));
  draft.forEach((t, i) => {
    const c = el("span", "chip on", t);
    const x = el("button", "x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", `Quitar ${t}`);
    x.addEventListener("click", () => { draft.splice(i, 1); paintDraft(); });
    c.appendChild(x);
    box.appendChild(c);
  });
}

function addDraftTag() {
  const v = $("tag-input").value.trim().toLowerCase().slice(0, 30);
  $("tag-input").value = "";
  if (!v || draft.includes(v)) return;
  if (draft.length >= 10) { $("tag-msg").textContent = "Máximo 10 tags por foto."; return; }
  draft.push(v);
  paintDraft();
}

async function saveDraft() {
  const cur = visible()[state.idx];
  if (!cur) return;
  addDraftTag(); // por si quedó texto escrito sin pulsar Enter
  $("save-tags").disabled = true;
  try {
    const saved = await api(`/photos/${encodeURIComponent(cur.id)}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags: draft }),
    });
    const p = state.photos.find((x) => x.id === cur.id);
    if (p) p.tags = saved.tags; // los normalizados por el servidor
    $("tag-editor").close();
    // Sigue mostrando la misma foto aunque cambie la lista filtrada.
    const pos = visible().findIndex((x) => x.id === cur.id);
    state.idx = pos >= 0 ? pos : 0;
    render();
  } catch (e) {
    $("tag-msg").textContent = e.message;
  } finally {
    $("save-tags").disabled = false;
  }
}

// ───── Subida (igual que antes) ─────
async function uploadFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const { uploadUrl, contentType } = await api("/photos/upload-url", {
    method: "POST",
    body: JSON.stringify({ ext }),
  });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error(`Fallo al subir ${file.name}`);
}

// ───── Eventos ─────
$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await login($("email").value, $("password").value);
    $("login-msg").textContent = "";
    showState();
  } catch (err) {
    $("login-msg").textContent = err.message;
  }
});
$("logout").addEventListener("click", logout);
$("btn-visor").addEventListener("click", () => { state.view = "visor"; render(); });
$("btn-galeria").addEventListener("click", () => { state.view = "galeria"; render(); });
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
document.addEventListener("keydown", (e) => {
  if ($("app").hidden || $("tag-editor").open || state.view !== "visor") return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
});

$("edit-tags").addEventListener("click", openTagEditor);
$("tag-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addDraftTag(); }
});
$("cancel-tags").addEventListener("click", () => $("tag-editor").close());
$("save-tags").addEventListener("click", saveDraft);

$("file").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  try {
    for (let i = 0; i < files.length; i++) {
      say(`Subiendo ${i + 1} de ${files.length}…`);
      await uploadFile(files[i]);
    }
    say("Procesando miniaturas…");
    setTimeout(() => { loadPhotos().then(() => say("")).catch((err) => say(err.message)); }, 5000);
  } catch (err) {
    say(err.message);
  }
});

showState();