import { handleLogin, handleVerify, handleLogout, getSessionUser } from './auth.js';
import { handleUsage } from './usage.js';
import { handleProfile } from './profile.js';
import { handleStripeCheckout, handleStripeWebhook } from './stripe.js';
import { handleFeedback, handleFeedbackReport } from './feedback.js';
import { handleProfileSubmit } from './profile_submit.js';
import { handleFreeProfileSubmit } from './profile_submit_free.js';
import { handleReportGenerate, handleGetReport, handleReportByProfile } from './report_generate.js';
import { handleAnalyseTal } from './analyse_tal.js';
import { handleGratisRapport } from './gratis_rapport.js';
import { handleGdprRadera } from './gdpr_radera.js';
import { handleGdprExport } from './gdpr_export.js';
import { handleGratisRapportStream } from './gratis_rapport_stream.js';

const ALLOWED_ORIGINS = [
  'https://holmbergfriends.com',
  'https://www.holmbergfriends.com',
  'https://alexanderholmberg.com',
  'https://www.alexanderholmberg.com',
  'https://sprakmonsterlabbet.holmbergfriends.com',
  'https://sprakmonsterlabbet.pages.dev',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Root → redirect till profilsidan
    if (path === '/' || path === '') {
      return Response.redirect('https://sprakmonsterlabbet.holmbergfriends.com/profil', 302);
    }

    // Servera frontend för icke-API paths via ASSETS-binding
    if (!path.startsWith('/api/')) {
      const assetRes = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
      if (assetRes.ok) return new Response(assetRes.body, assetRes);
    }

    const reply = (data, status = 200, cookie = null) => {
      const headers = {
        'Content-Type': 'application/json',
        ...corsHeaders(request),
      };
      if (cookie) headers['Set-Cookie'] = cookie;
      return new Response(JSON.stringify(data), { status, headers });
    };

    const unauthorized = () => reply({ ok: false, error: 'unauthorized' }, 401);

    // ── /assets/:filename ────────────────────────────────────────
    if (path.startsWith('/assets/') && method === 'GET') {
      const filename = path.slice('/assets/'.length);
      const assetRes = await env.ASSETS.fetch(new Request(new URL('/assets/' + filename, request.url)));
      if (!assetRes.ok) return reply({ error: 'Not found' }, 404);
      return new Response(assetRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
          ...corsHeaders(request),
        },
      });
    }

    // ── /api/health ──────────────────────────────────────────────
    if (path === '/api/health' && method === 'GET') {
      return reply({
        status: 'ok',
        service: 'Språkmonsterlabbet',
        timestamp: new Date().toISOString(),
      });
    }

    // ── /api/rapport-pris ──────────────────────────────────────
    if (path === '/api/rapport-pris' && method === 'GET') {
      const now = new Date();
      const kampanjSlut = new Date('2026-10-01T00:00:00Z');
      if (now < kampanjSlut) {
        return reply({
          price_id: 'price_1UEXTLHrTws6MQZqhYhf2711',
          belopp: 199,
          valuta: 'SEK',
          kampanj: true,
          ordinarie: 499,
          kampanj_slutar: '2026-09-30',
        });
      }
      return reply({
        price_id: 'price_1TE9RZHrTws6MQZqVEhOtaY0',
        belopp: 499,
        valuta: 'SEK',
        kampanj: false,
      });
    }

    // ── /api/auth/login ──────────────────────────────────────────
    if (path === '/api/auth/login' && method === 'POST') {
      const result = await handleLogin(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/auth/verify ─────────────────────────────────────────
    if (path === '/api/auth/verify' && method === 'POST') {
      const result = await handleVerify(request, env);
      return reply(result.body, result.status, result.cookie ?? null);
    }

    // ── /api/auth/logout ─────────────────────────────────────────
    if (path === '/api/auth/logout' && method === 'POST') {
      const result = await handleLogout(request, env);
      return reply(result.body, result.status, result.cookie ?? null);
    }

    // ── /api/gdpr-export ─────────────────────────────────────────
    if (path === '/api/gdpr-export' && method === 'POST') {
      const result = await handleGdprExport(request, env);
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) } });
    }

    // ── /api/gdpr-radera ─────────────────────────────────────────
    if (path === '/api/gdpr-radera' && method === 'POST') {
      const result = await handleGdprRadera(request, env);
      return reply(result.body, result.status);
    }

    // ── Skyddade endpoints — kräver inloggning ───────────────────
    const user = await getSessionUser(request, env);

    // ── /api/usage ───────────────────────────────────────────────
    if (path === '/api/usage' && method === 'GET') {
      if (!user) return unauthorized();
      const result = await handleUsage(user);
      return reply(result.body, result.status);
    }

    // ── /api/feedback ────────────────────────────────────────────
    if (path === '/api/feedback' && method === 'POST') {
      const result = await handleFeedback(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/feedback-report ─────────────────────────────────────
    if (path === '/api/feedback-report' && method === 'GET') {
      const result = await handleFeedbackReport(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/report/generate ──────────────────────────────────────
    if (path === '/api/report/generate' && method === 'POST') {
      const result = await handleReportGenerate(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/report ────────────────────────────────────────────────
    if (path === '/api/report' && method === 'GET') {
      const result = await handleGetReport(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/report-by-profile ──────────────────────────────────
    if (path === '/api/report-by-profile' && method === 'GET') {
      const result = await handleReportByProfile(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/gratis-rapport ──────────────────────────────────────
    if (path === '/api/gratis-rapport' && method === 'GET') {
      const result = await handleGratisRapport(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/gratis-rapport-stream (SSE) ─────────────────────────
    if (path === '/api/gratis-rapport-stream' && method === 'GET') {
      return handleGratisRapportStream(request, env);
    }

    // ── /api/profile/submit-free ────────────────────────────────
    if (path === '/api/profile/submit-free' && method === 'POST') {
      const result = await handleFreeProfileSubmit(request, env, ctx);
      return reply(result.body, result.status);
    }

    // ── /api/profile/submit ──────────────────────────────────────
    if (path === '/api/profile/submit' && method === 'POST') {
      const result = await handleProfileSubmit(request, env, ctx);
      return reply(result.body, result.status);
    }

    // ── /api/stripe/checkout ─────────────────────────────────────
    if (path === '/api/stripe/checkout' && method === 'POST') {
      const result = await handleStripeCheckout(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/stripe/webhook ──────────────────────────────────────
    if (path === '/api/stripe/webhook' && method === 'POST') {
      const result = await handleStripeWebhook(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/analyse-tal ──────────────────────────────────────────
    if (path === '/api/analyse-tal' && method === 'POST') {
      const result = await handleAnalyseTal(request, env);
      return reply(result.body, result.status);
    }

    // ── /api/profile ─────────────────────────────────────────────
    if (path === '/api/profile' && method === 'POST') {
      if (!user) return unauthorized();
      const result = await handleProfile(request, user, env);
      return reply(result.body, result.status);
    }

    // ── 404 ──────────────────────────────────────────────────────
    return reply({ error: 'Endpoint hittades inte' }, 404);
  },

  async scheduled(event, env, ctx) {
    const { resetMonthlyAnalyses } = await import('./airtable.js');
    const result = await resetMonthlyAnalyses(env);
    console.log('[cron] Månadsåterställning klar:', result);
  },
};
