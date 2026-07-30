/**
 * Vite middleware: expose /api/cloud during `npm run dev` / preview
 * using the same store as production server.mjs
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

async function readReq(req: import('http').IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

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
          if (url.startsWith('/api/auth')) {
            const auth = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/passwordReset.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            const handled = await auth.handlePasswordReset(req, res, parsed);
            if (!handled) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'not found' }));
            }
            return;
          }
          if (url.startsWith('/api/cloud/backups/')) {
            const backups = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/backups.mjs')).href
            );
            const parsed = new URL(url, 'http://localhost');
            await backups.handleBackups(req, res, parsed);
            return;
          }
          if (!url.startsWith('/api/cloud')) {
            next();
            return;
          }
          const store = await import('../server/cloudStore.mjs');
          const pathOnly = url.split('?')[0] || '';

          const send = (status: number, obj: unknown) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(obj));
          };

          if (req.method === 'OPTIONS') {
            send(204, {});
            return;
          }

          if (pathOnly === '/api/cloud/status') {
            send(200, store.statusPayload());
            return;
          }

          if (pathOnly.startsWith('/api/cloud/disk')) {
            const disk = await import(
              /* @vite-ignore */ pathToFileURL(resolve('server/diskFiles.mjs')).href
            );
            await disk.handleDiskFiles(req, res, new URL(url, 'http://localhost'));
            return;
          }

          if (pathOnly.startsWith('/api/cloud/templates')) {
            const m = pathOnly.match(/^\/api\/cloud\/templates(?:\/([^/]+))?$/);
            const synagogueId = decodeURIComponent(m?.[1] || '').trim();
            if (!synagogueId) {
              send(400, { error: 'חסר מזהה בית כנסת' });
              return;
            }
            if (req.method === 'GET') {
              send(200, {
                items: await store.getDesignTemplates(synagogueId),
                synagogueId,
              });
              return;
            }
            if (req.method === 'PUT') {
              const raw = await readReq(req);
              const body = JSON.parse(raw.toString('utf8') || '{}');
              const items = await store.putDesignTemplates(
                synagogueId,
                Array.isArray(body.items) ? body.items : [],
              );
              send(200, { ok: true, count: items.length, synagogueId });
              return;
            }
          }

          if (pathOnly === '/api/cloud/heartbeats' && req.method === 'GET') {
            send(200, { items: await store.listHeartbeats() });
            return;
          }
          if (pathOnly === '/api/cloud/heartbeats' && req.method === 'POST') {
            const raw = await readReq(req);
            const body = JSON.parse(raw.toString('utf8') || '{}');
            const saved = await store.putHeartbeat(body);
            send(200, { ok: true, heartbeat: saved });
            return;
          }

          if (pathOnly === '/api/cloud/synagogues' && req.method === 'GET') {
            const bundles = await store.listBundles();
            send(200, {
              items: bundles.map((b: { config: { id: string; name: string; updatedAt?: string; revision?: number }; syncedAt?: string }) => ({
                id: b.config.id,
                name: b.config.name,
                updatedAt: b.config.updatedAt,
                revision: b.config.revision,
                config: b.config,
                syncedAt: b.syncedAt,
              })),
            });
            return;
          }

          const mediaUsage = pathOnly.match(/^\/api\/cloud\/media\/([^/]+)\/usage$/);
          if (mediaUsage && req.method === 'GET') {
            const synagogueId = decodeURIComponent(mediaUsage[1]);
            send(200, { ok: true, ...store.getMediaUsage(synagogueId) });
            return;
          }

          const mediaPost = pathOnly.match(/^\/api\/cloud\/media\/([^/]+)$/);
          if (mediaPost && req.method === 'POST') {
            const synagogueId = decodeURIComponent(mediaPost[1]);
            const raw = await readReq(req);
            const body = JSON.parse(raw.toString('utf8') || '{}') as {
              fileName?: string;
              contentType?: string;
              dataBase64?: string;
            };
            if (!body.dataBase64) {
              send(400, { error: 'missing dataBase64' });
              return;
            }
            try {
              const buffer = Buffer.from(body.dataBase64, 'base64');
              const saved = await store.putMediaFile(
                synagogueId,
                body.fileName || `file-${Date.now()}.bin`,
                buffer,
                body.contentType || 'application/octet-stream',
              );
              send(200, {
                ok: true,
                url: saved.url,
                fileName: saved.fileName,
                bytes: saved.bytes,
                usedBytes: saved.usedBytes,
                limitBytes: saved.limitBytes,
              });
            } catch (err) {
              const msg = String((err as Error)?.message || err);
              send(msg.includes('מכסת האחסון') ? 413 : 500, { error: msg });
            }
            return;
          }

          const mediaGet = pathOnly.match(/^\/api\/cloud\/media\/([^/]+)\/([^/]+)$/);
          if (mediaGet && req.method === 'GET') {
            const synagogueId = decodeURIComponent(mediaGet[1]);
            const fileName = decodeURIComponent(mediaGet[2]);
            const file = await store.getMediaFile(synagogueId, fileName);
            if (!file) {
              send(404, { error: 'media not found' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(file.buffer);
            return;
          }

          const match = pathOnly.match(/^\/api\/cloud\/synagogues\/([^/]+)$/);
          if (!match) {
            send(404, { error: 'not found' });
            return;
          }
          const id = decodeURIComponent(match[1]);

          if (req.method === 'GET') {
            const bundle = await store.getBundle(id);
            if (!bundle) {
              send(404, { error: 'not found' });
              return;
            }
            send(200, bundle);
            return;
          }

          if (req.method === 'PUT') {
            const raw = await readReq(req);
            const body = JSON.parse(raw.toString('utf8') || '{}');
            const config = body.config || body;
            if (!config?.id || config.id !== id) {
              send(400, { error: 'invalid config' });
              return;
            }
            const bundle = {
              config,
              syncedAt: new Date().toISOString(),
              weather: body.weather,
              pendingSync: false,
            };
            await store.putBundle(id, bundle);
            send(200, { ok: true, backend: store.statusPayload().backend, syncedAt: bundle.syncedAt });
            return;
          }

          if (req.method === 'DELETE') {
            const summary = await store.purgeSynagogueData(id);
            send(200, { ok: true, purged: summary });
            return;
          }

          send(405, { error: 'method not allowed' });
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String((err as Error)?.message || err) }));
        }
      });
    },
  };
}
