/**
 * Vite middleware: expose /api/* during `npm run dev` / preview
 * using the same handlers as production server.mjs
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

export function cloudApiPlugin(): Plugin {
  return {
    name: 'shul-cloud-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || '';
          if (url.startsWith('/api/oref/drill')) {
            const drill = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/orefDrill.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            const handled = await drill.handleOrefDrill(req, res, parsed);
            if (!handled) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'not found' }));
            }
            return;
          }
          if (url.startsWith('/api/billing')) {
            const billing = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/billing.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await billing.handleBilling(req, res, parsed);
            return;
          }
          if (url.startsWith('/api/notifications')) {
            const notifications = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/notifications.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await notifications.handleNotifications(req, res, parsed);
            return;
          }
          if (url.startsWith('/api/inquiries')) {
            const inquiries = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/inquiries.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await inquiries.handleInquiries(req, res, parsed);
            return;
          }
          if (url.startsWith('/api/signup')) {
            const signup = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/trialSignup.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await signup.handleTrialSignup(req, res, parsed);
            return;
          }
          if (url.startsWith('/api/analytics')) {
            const analytics = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/landingAnalytics.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await analytics.handleLandingAnalytics(req, res, parsed);
            return;
          }
          if (url.startsWith('/api/public')) {
            const pub = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/publicDirectory.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            const handled = await pub.handlePublicDirectory(req, res, parsed);
            if (!handled) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'not found' }));
            }
            return;
          }
          if (url.startsWith('/api/app-version')) {
            const ver = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/appVersion.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            const handled = await ver.handleAppVersion(req, res, parsed);
            if (!handled) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'not found' }));
            }
            return;
          }
          if (url.startsWith('/api/auth')) {
            const auth = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/passwordReset.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            let handled = await auth.handlePasswordReset(req, res, parsed);
            if (!handled) {
              const alt = await import(
                /* @vite-ignore */ pathToFileURL(resolve('server/altAuth.mjs')).href
              );
              handled = await alt.handleAltAuth(req, res, parsed);
            }
            if (!handled) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'not found' }));
            }
            return;
          }
          if (url.startsWith('/api/cloud')) {
            const cloud = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/cloudHttp.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await cloud.handleCloud(req, res, parsed);
            return;
          }
          next();
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String((err as Error)?.message || err) }));
        }
      });
    },
  };
}
