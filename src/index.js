const Stripe = require("stripe");

async function handleRequest(request, env) {
  const stripe = Stripe(env.STRIPE_API_KEY);
  const { headers } = request;
  const contentType = headers.get("content-type") || "";
  const printfulApiKey = env.PRINTFUL_TOKEN;

  if (request.method === "POST" && contentType.includes("application/json")) {
    try {
      // Extract the POST data as a JSON object
      const data = await request.json();

      // console.log(data.data);
      const sessionId = data.data.object.id;

      const checkoutSession = await stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand: ["line_items", "line_items.data.price.product"],
        }
      );
      // Extract the shipping and contact information from the Checkout Session object
      let orderData = checkoutSession.shipping_details;
      orderData.email = checkoutSession.customer_details.email;
      orderData.external_id = checkoutSession.payment_intent;

      // Get the line item data
      let lineItems = [];
      for (let item of checkoutSession.line_items.data) {
        // console.log(item, item.price, "what was the customer set price?");
        lineItems.push({
          external_variant_id: item.price.product.metadata.printful_product_id,
          retail_price: (item.price.unit_amount / 100).toFixed(2),
          quantity: item.quantity,
        });
      }

      //Create the order with Printful using their API
      const order = await createPrintfulOrder(
        printfulApiKey,
        orderData,
        lineItems
      );
      //Print the order ID to the console
      console.log(`Printful order created with ID: ${order.id}`);
    } catch (err) {
      console.error("Error parsing webhook payload", err);
    }
  } else {
    console.error(
      "Invalid webhook request + wasn't a post + ratio + don't care"
    );
  }

  return new Response("hello waifu");
}

async function createPrintfulOrder(printfulApiKey, orderData, lineItems) {
  // Build the request payload
  const payload = {
    external_id: orderData.external_id,
    recipient: {
      name: orderData.name,
      address1: orderData.address.line1,
      address2: orderData.address.line2 || "",
      city: orderData.address.city,
      state_code: orderData.address.state,
      country_code: orderData.address.country,
      zip: orderData.address.postal_code,
      email: orderData.email,
    },
    items: lineItems,
  };

  // Send the request to the Printful API
  // confirm param can let orders be confirmed automatically
  const queryParams = new URLSearchParams();
  queryParams.set("confirm", false);
  const endpointWithParams = `https://api.printful.com/orders?${queryParams.toString()}`;

  const response = await fetch(endpointWithParams, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${printfulApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  // Parse the response JSON and return the order object
  const data = await response.json();
  return data.result;
}

export default {
  fetch: handleRequest,
};
