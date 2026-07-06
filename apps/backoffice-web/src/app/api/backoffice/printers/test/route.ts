import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { queueAndProcessTestPrint } from "@/lib/printing/print-service";

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const body = (await req.json()) as { printer_id?: string };
    const printerId = body.printer_id?.trim();

    if (!printerId) {
      return fail("invalid_printer_id", "printer_id is required.", 422);
    }

    const result = await queueAndProcessTestPrint(auth, printerId);
    return ok({
      printer_id: printerId,
      job: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "forbidden_role") {
      return fail("forbidden_role", "Only manager or owner can run test print.", 403);
    }
    if (message === "printer_not_found") {
      return fail("printer_not_found", "Printer is not found in this branch.", 404);
    }
    return fail("test_print_failed", message, 400);
  }
}
