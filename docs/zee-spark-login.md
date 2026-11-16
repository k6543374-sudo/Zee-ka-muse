# Zee Spark login, UI and web voice prototype

Local changes only. Do not enable public login until the live checks below pass.

## What changed

- Optional Supabase email/password sign-in, signup and reset-password screens.
- Passwords go directly to the existing Supabase Auth project. No password is stored by the app.
- Refresh tokens are retained per device, in SecureStore on native and local app storage on web. Web storage is not an HttpOnly cookie; keep dependencies and XSS protections current.
- API authorization calls the Supabase user endpoint to validate each token. It rejects unverified identities and old key-based sessions when enabled. Network failure fails closed.
- An explicit verified owner UUID maps to the existing `local-user` workspace. Every other identity gets a distinct `user:<UUID>` owner. No first-user claim, email match or user-editable metadata can take over existing data.
- Logout revokes the current access token locally as well as the provider refresh session. A remote logout failure is reported to the user. Revocation rows contain token digests only. Add periodic pruning after JWT expiry before scaling; this prototype retains them.
- Public login is off unless AUTH_PUBLIC_LOGIN=true. Legacy shared-key behavior remains only when AUTH_PROVIDER is unset, so deployment can be staged without locking out the owner.
- Desktop chat sidebar, mobile menu, New chat, cleaner messages, named navigation tabs and browser Copy response.
- Existing code already provides streaming, Stop, markdown/code, attachments, thread history/rename/archive and error-retry. No generic regenerate action added because it can replay tool side effects.
- Web voice tools: opt-in Speak puts text in the draft, explicit Send; Read reply and Stop audio. The browser's speech provider may process microphone audio remotely. No paid audio API or Google-account setup. No native APK voice support in this patch.

## Branding

The owner-supplied warrior artwork is cropped to the helmet for legibility at small sizes. The bottom-right sparkle mark is outside the crop. Default login/header/sidebar logo is a 43.6 KB PNG; 64px favicon, PWA/apple icons, native app-icon and splash references are updated. Existing package IDs and URI scheme stay unchanged so this does not create a different installed app. Native icon changes require a rebuilt APK.

## Required settings, without creating another project

On the existing Supabase project, under authenticated owner control:

1. Enable the email/password provider, require confirmed email, use a 12+ character password policy.
2. Configure an approved custom SMTP sender. The default sender is team-only and 2 emails/hour, so it cannot support public users. No new sender account or DNS change is authorized by this code.
3. Set Auth Site URL to the real web app origin and allow that exact origin for signup/reset redirects. Keep email links on that origin. Native deep links are not configured; reset/verification opens on the web.
4. Have the owner create and verify their own login using a password they choose. Do not put that password in a message or source code. Recover the verified Auth UUID from the authenticated project, confirm it belongs to the owner's account, and bind it explicitly below.
5. Review Supabase Auth rate limits and abuse settings, including CAPTCHA if public abuse warrants it. CAPTCHA provider setup is not implemented here. The existing API limiter is retained, and session exchange adds 30 requests/minute per resolved client. Trust proxy headers only on a deployment that rewrites them safely.

Server environment:

- AUTH_PROVIDER=supabase
- SUPABASE_URL=existing project URL
- SUPABASE_PUBLISHABLE_KEY=public publishable key or legacy anon key, never the service-role or secret key. Config rejects secret/service-role keys.
- AUTH_OWNER_USER_ID=explicit verified owner's Auth UUID
- AUTH_PUBLIC_LOGIN=true after end-to-end tests pass
- Preserve DATABASE_URL, SUPABASE_SERVICE_KEY, TOKEN_ENCRYPTION_KEY and existing storage settings. None of these may enter the client bundle.

The client reads only the public auth URL/key from `/api/auth/config`; no extra build-time auth secret is needed. Its API URL still comes from EXPO_PUBLIC_API_URL.

## Required live acceptance checks before public launch

- Verify a real signup email and password-reset email arrive for a non-team address.
- Verify signup links return to the exact approved web origin; create a new password after reset.
- Sign in as owner and confirm existing chats/files/Google connection remain private and accessible.
- Sign in as a second verified test account. Confirm owner chats/files/tasks/credentials and remote thread history cannot be read or changed, even by guessing IDs. Rich-thread storage is provided by the existing runtime and needs a real multi-user check in addition to local owner-routing tests.
- Sign out, ensure API access with that token fails, then reload and ensure the account stays signed out. Check refresh after expiry and resumed mobile tabs.
- Test web microphone permission allowed/denied, recognition language, read-aloud and Stop on the owner's actual phone/browser. Unsupported browsers must retain text input.
- Confirm public AI usage cannot exhaust the owner's free model/hosting allowances; rate limits are not a full per-user quota system. Consider per-user daily quotas before a broad public launch.
- Verify all existing action approvals still apply. Public login does not make Gmail/Calendar connectors public-ready; the existing OAuth project's audience/testing restrictions remain unchanged.

## Current validation

Typechecks, web export and focused auth/API/markdown tests pass. Controlled browser fixtures cover desktop/mobile login/signup, incorrect-password handling, modern chat rendering, Copy response, voice transcript-to-draft, read-aloud dispatch, Stop audio and denied microphone fallback. Voice fixtures mock the browser speech APIs, so they do not prove real audio recognition or sound output. Actual Supabase email delivery, production multi-user thread isolation, hardware microphone and native APK are not yet verified. No push, deployment, external account change or spending was performed.

## Official references

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/pricing
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
