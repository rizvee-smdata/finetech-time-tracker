// SSO auto-login receiver. Reads #sso=<token> from URL, verifies via
// /api/sso/verify, then fills the login form and submits it.

function setNativeValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const elemSetter = Object.getOwnPropertyDescriptor(el, "value")?.set;
  if (setter && setter !== elemSetter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function findForm(): {
  user: HTMLInputElement;
  pass: HTMLInputElement;
  submit: HTMLButtonElement | null;
} | null {
  const user = document.querySelector<HTMLInputElement>(
    'input[type=email], input[name=username], input[name=email]'
  );
  const pass = document.querySelector<HTMLInputElement>('input[type=password]');
  if (!user || !pass) return null;
  const submit =
    (pass.form?.querySelector('button[type=submit]') as HTMLButtonElement | null) ??
    document.querySelector<HTMLButtonElement>('button[type=submit]');
  return { user, pass, submit };
}

async function waitForForm(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise<ReturnType<typeof findForm>>((resolve) => {
    const tick = () => {
      const f = findForm();
      if (f) return resolve(f);
      if (Date.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(() => setTimeout(tick, 100));
    };
    tick();
  });
}

let ran = false;

export async function runSsoAutofill() {
  if (ran || typeof window === "undefined") return;
  const hash = window.location.hash;
  const m = hash.match(/(?:^|[#&])sso=([^&]+)/);
  if (!m) return;
  ran = true;

  const token = decodeURIComponent(m[1]);

  // Strip from history
  const newHash = hash.replace(/(^|[#&])sso=[^&]*/, "").replace(/^#&?/, "#");
  const cleaned = newHash === "#" || newHash === "" ? "" : newHash;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + cleaned
  );

  let creds: { username: string; password: string };
  try {
    const res = await fetch("/api/sso/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sig: token }),
    });
    if (!res.ok) {
      console.warn("[sso] verify failed", res.status);
      return;
    }
    creds = await res.json();
  } catch (err) {
    console.warn("[sso] verify error", err);
    return;
  }

  const form = await waitForForm(8000);
  if (!form) {
    console.warn("[sso] form not found");
    return;
  }

  setNativeValue(form.user, creds.username);
  setNativeValue(form.pass, creds.password);

  await new Promise((r) => setTimeout(r, 150));
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  form.submit?.click();
}
