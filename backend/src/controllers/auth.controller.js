import {
  clearAuthCookies,
  loginUser,
  logoutSession,
  publicUser,
  refreshSession,
  registerUser,
  resendVerification,
  verifyEmail,
} from "../services/auth.service.js";

export async function register(req, res) {
  const { user, verificationRequired } = await registerUser(req.body, res);
  res.status(201).json({
    user: publicUser(user),
    verificationRequired,
    message: verificationRequired
      ? "Check your college inbox to verify your email."
      : "Account created.",
  });
}

export async function login(req, res) {
  const user = await loginUser(req.body, res);
  res.json({ user });
}

export async function refresh(req, res) {
  res.json({ user: await refreshSession(req, res) });
}

export async function logout(req, res) {
  try {
    await logoutSession(req);
  } finally {
    clearAuthCookies(res);
  }
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

export async function verify(req, res) {
  await verifyEmail(req.body.token);
  res.json({ message: "Email verified. You can now sign in." });
}

export async function resend(req, res) {
  await resendVerification(req.body.email);
  res.status(202).json({ message: "If the account needs verification, a new link will be sent." });
}

export function adminAccess(_req, res) {
  res.json({ authorized: true });
}
