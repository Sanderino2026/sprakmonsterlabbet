// beacon.js — Språkmönsterlabbet event tracking till deep-thought site_event
// Ingen personuppgift, ingen cookie, ingen fingerprinting.
(function() {
  var ENDPOINT = 'https://deep-thought.holmbergfriends.com/api/site/event';
  var DOMAN = 'sprakmonsterlabbet.holmbergfriends.com';

  // Session-ID: slumpad per sidladdning (ej persistent)
  var sid = Math.random().toString(36).slice(2) + Date.now().toString(36);

  function getUtmParams() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source') || sessionStorage.getItem('sml_utm_source') || '',
      utm_medium: p.get('utm_medium') || sessionStorage.getItem('sml_utm_medium') || '',
      utm_campaign: p.get('utm_campaign') || sessionStorage.getItem('sml_utm_campaign') || ''
    };
  }

  function send(typ, extra) {
    try {
      var utm = getUtmParams();
      var payload = {
        typ: typ,
        session_id: sid,
        url: window.location.href,
        doman: DOMAN,
        sida: window.location.pathname,
        referrer: document.referrer || '',
        kalla: utm.utm_source || 'direkt',
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        data: extra ? JSON.stringify(extra) : ''
      };
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
      } else {
        fetch(ENDPOINT, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function() {});
      }
    } catch (e) { /* fire-and-forget */ }
  }

  // Sidvisning → site_besok (typ 'sidvisning' med doman)
  send('sidvisning');
  // Namngiven händelse → site_event
  send('sml_sidvisning');

  // Exponera globalt så att enskilda sidor kan skicka namngivna händelser
  window.smlBeacon = send;
})();
