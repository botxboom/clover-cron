const cron = require("node-cron");
require("dotenv").config();

let latestCustomerSince = null;
let latestOrderCreatedTime = null;
let latestPaymentCreatedTime = null;
let latestCountOfItems = 0;

function getFetchDataMetadata() {
  return [
    {
      type: "customers",
      path: `/customers`,
      limit: 100,
      filter: latestCustomerSince
        ? `customerSince>${latestCustomerSince || ""}`
        : null,
    },
    {
      type: "payments",
      path: `/payments`,
      limit: 100,
      filter: latestPaymentCreatedTime
        ? `createdTime>${latestPaymentCreatedTime || ""}`
        : null,
    },
    {
      type: "orders",
      path: `/orders`,
      limit: 100,
      filter: latestOrderCreatedTime
        ? `createdTime>${latestOrderCreatedTime || ""}`
        : null,
    },
    {
      type: "inventory",
      path: `/items`,
      limit: 100,
      filter: null,
    },
  ];
}

async function fetchData() {
  try {
    const fetchDataPromises = getFetchDataMetadata().map(async (data) => {
      if (data.type === "inventory" && latestCountOfItems > 0) {
        return {
          type: data.type,
          data: [],
        };
      }

      const apiPath = `${process.env.CLOVER_BASE_URL}/${
        process.env.CLOVER_MERCHANT_ID
      }${data.path}?limit=${data.limit}${
        data.filter ? `&filter=${data.filter}` : ""
      }`;

      const response = await fetch(apiPath, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${process.env.CLOVER_ACCESS_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      try {
        const jsonData = await response.json();
        if (data.type === "customers" && jsonData.elements.length > 0) {
          // Update latestCustomerSince with the most recent customer
          // This assumes customerSince is a timestamp or date string
          latestCustomerSince = jsonData.elements[0]?.customerSince || null;
        } else if (data.type === "orders" && jsonData.elements.length > 0) {
          // Update latestOrderCreatedTime with the most recent order
          // This assumes createdTime is a timestamp or date string
          latestOrderCreatedTime = jsonData.elements[0]?.createdTime || null;
        } else if (data.type === "payments" && jsonData.elements.length > 0) {
          // Update latestPaymentCreatedTime with the most recent payment
          // This assumes createdTime is a timestamp or date string
          latestPaymentCreatedTime = jsonData.elements[0]?.createdTime || null;
        } else {
          // Update latestCountOfItems with the count of items
          latestCountOfItems = jsonData.elements.length;
        }

        return {
          type: data.type,
          data: jsonData.elements,
        };
      } catch (error) {
        console.error(`Error parsing JSON for ${data.type}:`, error);
        throw error;
      }
    });

    return await Promise.all(fetchDataPromises);
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}

const CLOVER_HUBSPOT_MAPPING = {
  customers: "contacts",
  orders: "orders",
  payments: "commerce_payments",
  inventory: "products",
};

function postCustomersToHubSpot(customers) {
  if (customers.length === 0) {
    return;
  }

  const mapCustomersToHubspot = customers.map((customer) => {
    return {
      properties: {
        firstname: customer.firstName,
        lastname: customer.lastName,
      },
    };
  });

  fetch(
    `${process.env.HUBSPOT_API_URL}/${
      CLOVER_HUBSPOT_MAPPING[item.type]
    }/batch/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        inputs: mapCustomersToHubspot,
      }),
    }
  )
    .then((response) => {
      if (!response.ok) {
        console.error("Error response from HubSpot:", response);
      } else {
        console.log("Customers posted to HubSpot successfully.");
      }
    })
    .then((data) => {
      console.log("HubSpot response data:", data);
    });
}

function postInventoryToHubSpot(items) {
  if (items.length === 0) {
    return;
  }
  const mapInventoryToHubspot = items.map((item) => {
    return {
      properties: {
        name: item.name,
        price: item.price,
      },
    };
  });

  fetch(
    `${process.env.HUBSPOT_API_URL}/${CLOVER_HUBSPOT_MAPPING.inventory}/batch/create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: mapInventoryToHubspot,
      }),
    }
  )
    .then((response) => {
      if (!response.ok) {
        console.error("Error response from HubSpot:", response);
      } else {
        console.log("Inventory posted to HubSpot successfully.");
      }
    })
    .then((data) => {
      console.log("HubSpot response data:", data);
    });
}

function postOrdersToHubSpot(orders) {
  if (orders.length === 0) {
    return;
  }

  const mapOrdersToHubspot = orders.map((order) => {
    return {
      properties: {
        order_id: order.id,
        customer_id: order.customerId,
        total_amount: order.totalAmount,
      },
    };
  });

  console.log("Mapped orders to HubSpot format:", mapOrdersToHubspot);

  return;
  fetch(`${process.env.HUBSPOT_API_URL}/${CLOVER_HUBSPOT_MAPPING[item.type]}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
}

function postPaymentsToHubSpot(payments) {
  if (payments.length === 0) {
    return;
  }

  const mapPaymentsToHubspot = payments.map((payment) => {
    return {
      properties: {
        payment_id: payment.id,
        amount: payment.amount,
        status: payment.status,
      },
    };
  });

  fetch(
    `${process.env.HUBSPOT_API_URL}/${CLOVER_HUBSPOT_MAPPING.payments}/batch/create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(mapPaymentsToHubspot),
    }
  );
}

async function postDataToHubSpot(fetchedData) {
  try {
    const customers = fetchedData[0].data;
    const inventory = fetchedData[3].data;
    const payments = fetchedData[1].data;
    const orders = fetchedData[2].data;

    postCustomersToHubSpot(customers);
    postInventoryToHubSpot(inventory);
    // postOrdersToHubSpot(orders);
    // postPaymentsToHubSpot(payments);
  } catch (error) {
    console.error("Error posting data to HubSpot:", error);
    throw error;
  }
}

async function fetchAndPostData() {
  try {
    console.log("Starting fetch and post process...");
    const fetchedData = await fetchData();

    const results = await postDataToHubSpot(fetchedData);
    console.log("Data successfully processed:", results);
  } catch (error) {
    console.error("Error in fetchAndPostData:", error);
  }
}

// Schedule the cron job to run every hour
cron.schedule("0 * * * *", async () => {
  console.log("Cron job started at:", new Date().toISOString());
  await fetchAndPostData();
});

// Run the fetch and post process immediately when the application starts
(async () => {
  console.log("Application started. Running initial fetch and post process...");
  await fetchAndPostData();
})();
