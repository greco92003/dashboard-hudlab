import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Log the data request
    console.log("Customer data request webhook received:", body);
    
    // Handle LGPD data request
    // You should return customer data in the required format
    
    return NextResponse.json({ 
      success: true,
      message: "Data request processed" 
    });
  } catch (error) {
    console.error("Customer data request webhook error:", error);
    return NextResponse.json(
      { error: "Data request processing failed" },
      { status: 500 }
    );
  }
}