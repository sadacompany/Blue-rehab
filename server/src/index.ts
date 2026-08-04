import cors from "cors";
import express from "express";
import helmet from "helmet";
import {
  apiErrorResult,
  createBookingDraft,
  createBookingMeeting,
  createEnrollment,
  createPaymentCheckout,
  getCatalog,
  getCourseDetail,
  getHealth,
  getPaymentConfig,
  verifyPayment,
  type ApiResult,
} from "./runtime-api.js";
import { config } from "./config.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.CLIENT_URL, credentials: false }));
app.use(express.json({ limit: "1mb" }));

function sendResult(response: express.Response, result: ApiResult) {
  if (result.cacheControl) response.setHeader("Cache-Control", result.cacheControl);
  return response.status(result.status).json(result.body);
}

app.get("/api/health", (_request, response) => sendResult(response, getHealth()));
app.get("/api/catalog", async (_request, response, next) => { try { return sendResult(response, await getCatalog()); } catch (error) { return next(error); } });
app.get("/api/courses/:slug", async (request, response, next) => { try { return sendResult(response, await getCourseDetail(request.params.slug)); } catch (error) { return next(error); } });
app.post("/api/bookings/drafts", async (request, response, next) => { try { return sendResult(response, await createBookingDraft(request.headers.authorization ?? null, request.body)); } catch (error) { return next(error); } });
app.post("/api/bookings/:bookingId/meet", async (request, response, next) => { try { return sendResult(response, await createBookingMeeting(request.headers.authorization ?? null, { bookingId: request.params.bookingId })); } catch (error) { return next(error); } });
app.post("/api/enrollments", async (request, response, next) => { try { return sendResult(response, await createEnrollment(request.headers.authorization ?? null, request.body)); } catch (error) { return next(error); } });
app.get("/api/payments/config", (_request, response) => sendResult(response, getPaymentConfig()));
app.post("/api/payments/checkout", async (request, response, next) => { try { return sendResult(response, await createPaymentCheckout(request.headers.authorization ?? null, request.body)); } catch (error) { return next(error); } });
app.post("/api/payments/verify", async (request, response, next) => { try { return sendResult(response, await verifyPayment(request.headers.authorization ?? null, request.body)); } catch (error) { return next(error); } });
app.use((_request, response) => response.status(404).json({ error: "Route not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => sendResult(response, apiErrorResult(error)));
app.listen(config.PORT, () => console.log(`Blue Rehab API listening on port ${config.PORT}`));
