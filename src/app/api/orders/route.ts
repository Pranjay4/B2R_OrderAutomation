import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const orderSchema = z.object({
  customer_name: z.string().trim().min(2).max(160),
  customer_phone: z.string().trim().min(7).max(40),
  customer_business: z.string().trim().max(160).default(""),
  delivery_address: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(1000).default(""),
  idempotency_key: z.string().uuid(),
  lines: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(100000),
  })).min(1).max(50),
});

export async function POST(request: Request) {
  try {
    const body = orderSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_order_request", {
      p_customer_name: body.customer_name,
      p_customer_phone: body.customer_phone,
      p_customer_business: body.customer_business,
      p_delivery_address: body.delivery_address,
      p_notes: body.notes,
      p_idempotency_key: body.idempotency_key,
      p_lines: body.lines,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ order_id: result.order_id, order_number: result.order_number });
  } catch (caught) {
    if (caught instanceof z.ZodError) {
      return NextResponse.json({ error: "Please check the order details and try again." }, { status: 400 });
    }
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Unable to submit order request." }, { status: 500 });
  }
}
