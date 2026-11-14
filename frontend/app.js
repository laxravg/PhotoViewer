const { apiUrl, region, clientId } = window.CONFIG;
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("idToken");

function say(text) {
  $("msg").textContent = text;
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

async function loadPhotos() {
  const photos = await api("/photos");
  const grid = $("grid");
  grid.replaceChildren();
  for (const p of photos) {
    const img = document.createElement("img");
    img.src = p.thumbUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("click", () => {
      $("big").src = p.webUrl;
      $("lightbox").hidden = false;
    });
    grid.appendChild(img);
  }
  say(photos.length ? "" : "Todavía no hay fotos. Sube alguna.");
}

async function uploadFile(file) {
  const ext = file.name.split(".").pop();
  const { uploadUrl, contentType } = await api("/photos/upload-url", {
    method: "POST",
    body: JSON.stringify({ ext }),
  });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error("Falló la subida de " + file.name);
}

function showState() {
  const logged = Boolean(token);
  $("login").hidden = logged;
  $("app").hidden = !logged;
  $("logout").hidden = !logged;
  if (logged) loadPhotos().catch((err) => say(err.message));
}

$("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    say("Entrando…");
    await login($("email").value, $("password").value);
    say("");
    showState();
  } catch (err) {
    say(err.message);
  }
});

$("file").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  try {
    for (let i = 0; i < files.length; i++) {
      say(`Subiendo ${i + 1} de ${files.length}…`);
      await uploadFile(files[i]);
    }
    say("Procesando miniaturas…");
    setTimeout(() => loadPhotos().catch((err) => say(err.message)), 5000);
  } catch (err) {
    say(err.message);
  }
  event.target.value = "";
});

$("logout").addEventListener("click", logout);
$("lightbox").addEventListener("click", () => {
  $("lightbox").hidden = true;
  $("big").src = "";
});

showState();