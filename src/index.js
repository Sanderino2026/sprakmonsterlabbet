import { handleLogin, handleVerify, handleLogout, getSessionUser } from './auth.js';
import { handleUsage } from './usage.js';
import { handleAnalyseText } from './analyse.js';
import { handleAnalyseTextStandalone } from './analyse_standalone.js';
import { handleProfile } from './profile.js';
import { handleGetExercise, handleAnswer } from './training.js';
import { handleSendAnalysis } from './send_analysis.js';
import { handleStripeCheckout, handleStripeWebhook } from './stripe.js';
import { handleFeedback, handleFeedbackReport } from './feedback.js';
import { handleProfileSubmit } from './profile_submit.js';
import { findUserByRecordId, rateAnalysis } from './airtable.js';
import { handleReportGenerate, handleGetReport, handleReportByProfile } from './report_generate.js';
import { handleAnalyseTal } from './analyse_tal.js';
import { handleGratisRapport } from './gratis_rapport.js';

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
      return Response.redirect('https://sprakmonsterlabbet.holmbergfriends.com/profil.html', 302);
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

    // ── Skyddade endpoints — kräver inloggning ───────────────────
    const user = await getSessionUser(request, env);

    // ── /api/analyses-status ─────────────────────────────────────
    if (path === '/api/analyses-status' && method === 'GET') {
      // Inloggad användare
      if (user) {
        return reply({ ok: true, remaining_analyses: user.remaining_analyses, access_type: user.access_type });
      }
      // Fördröj Airtable-anropet efter betalning så webhook hinner landa
      if (url.searchParams.get('after_payment') === '1') {
        await new Promise(r => setTimeout(r, 1500));
      }
      // Anonym besökare med guest_id query-param
      const guestId = url.searchParams.get('guest_id');
      if (guestId) {
        const record = await findUserByRecordId(guestId, env);
        if (record) {
          return reply({ ok: true, remaining_analyses: record.remaining_analyses, access_type: record.access_type });
        }
      }
      // Ny besökare — returnera standardkvot
      return reply({ ok: true, remaining_analyses: 3, access_type: null });
    }

    // ── /api/usage ───────────────────────────────────────────────
    if (path === '/api/usage' && method === 'GET') {
      if (!user) return unauthorized();
      const result = await handleUsage(user);
      return reply(result.body, result.status);
    }

    // ── /api/analyses/rate ───────────────────────────────────────
    if (path === '/api/analyses/rate' && method === 'POST') {
      const { analysis_record_id, rating } = await request.json().catch(() => ({}));
      if (!analysis_record_id || !rating) return reply({ error: 'Saknar data' }, 400);
      await rateAnalysis(analysis_record_id, rating, env);
      return reply({ success: true }, 200);
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

    // ── /api/profile/submit ──────────────────────────────────────
    if (path === '/api/profile/submit' && method === 'POST') {
      const result = await handleProfileSubmit(request, env, ctx);
      return reply(result.body, result.status);
    }

    // ── /api/send-analysis ───────────────────────────────────────
    if (path === '/api/send-analysis' && method === 'POST') {
      const result = await handleSendAnalysis(request, env);
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

    // ── /api/analyse-text-standalone ─────────────────────────────
    if (path === '/api/analyse-text-standalone' && method === 'POST') {
      const result = await handleAnalyseTextStandalone(request, env);
      return reply(result.body, result.status, result.cookie ?? null);
    }

    // ── /api/analyse-text ────────────────────────────────────────
    if (path === '/api/analyse-text' && method === 'POST') {
      if (!user) return unauthorized();
      const result = await handleAnalyseText(request, user, env);
      return reply(result.body, result.status);
    }

    // ── /api/profile ─────────────────────────────────────────────
    if (path === '/api/profile' && method === 'POST') {
      if (!user) return unauthorized();
      const result = await handleProfile(request, user, env);
      return reply(result.body, result.status);
    }

    // ── /api/training/exercise ───────────────────────────────────
    if (path === '/api/training/exercise' && method === 'GET') {
      if (!user) return unauthorized();
      const result = await handleGetExercise(request, user, env);
      return reply(result.body, result.status);
    }

    // ── /api/training/answer ─────────────────────────────────────
    if (path === '/api/training/answer' && method === 'POST') {
      if (!user) return unauthorized();
      const result = await handleAnswer(request, user, env);
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
