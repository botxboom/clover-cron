const cron = require("node-cron");
require("dotenv").config();

let latestCustomerSince = null;

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
      filter: null,
    },
    {
      type: "orders",
      path: `/orders`,
      limit: 100,
      filter: null,
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
  const mapCustomersToHubspot = customers.map((customer) => {
    return {
      properties: {
        firstname: customer.firstName,
        lastname: customer.lastName,
      },
    };
  });

  console.log("Mapped customers to HubSpot format:", mapCustomersToHubspot);

  return;
  fetch(`${process.env.HUBSPOT_API_URL}/${CLOVER_HUBSPOT_MAPPING[item.type]}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
}

async function postDataToHubSpot(fetchedData) {
  try {
    const customers = fetchedData[0].data;
    const payments = fetchedData[1].data;
    const orders = fetchedData[2].data;
    const inventory = fetchedData[3].data;

    postCustomersToHubSpot(customers);

    const results = await Promise.all(postDataPromises);
    console.log("Data successfully posted to HubSpot:", results);
    return results;
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

// Schedule the cron job to run at the first minute of every hour
cron.schedule("1 * * * *", async () => {
  console.log("Cron job started at:", new Date().toISOString());
  await fetchAndPostData();
});

// Run the fetch and post process immediately when the application starts
(async () => {
  console.log("Application started. Running initial fetch and post process...");
  await fetchAndPostData();
})();
