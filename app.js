const cron = require("node-cron");
require("dotenv").config();

let latestCustomerSince = null;
let latestOrderCreatedTime = null;
let latestPaymentCreatedTime = null;
let latestCountOfItems = 0;

class CloverHubSpotAPI {
  #baseUrl = process.env.CLOVER_BASE_URL;
  #merchantId = process.env.CLOVER_MERCHANT_ID;
  #accessToken = process.env.CLOVER_ACCESS_TOKEN;

  #cloverHubspotObjectMapping = {
    customers: "contacts",
    inventory: "products",
    orders: "deals",
    payments: "commerce_payments",
  };

  constructor() {
    this.customers = [];
    this.payments = [];
    this.orders = [];
    this.inventory = [];
  }

  async getCustomers(limit = 100) {
    const apiPath = `${this.#baseUrl}/${
      this.#merchantId
    }/customers?expand=emailAddresses&limit=${limit}${
      latestCustomerSince ? `&customerSince>${latestCustomerSince}` : ""
    }`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    if (jsonData.elements.length > 0) {
      this.customers = jsonData.elements.map((customer) => {
        const email =
          customer.emailAddresses?.elements[0]?.emailAddress || null;
        return {
          properties: {
            cloverid: customer.id,
            firstname: customer.firstName,
            lastname: customer.lastName,
            email: email,
          },
        };
      });

      if (this.customers.length > 0) {
        latestCustomerSince = this.customers[0]?.customerSince || null;
      }
    } else {
      latestCustomerSince = null;
    }

    return this.customers;
  }

  async getCustomerById(id) {
    const apiPath = `${this.#baseUrl}/${
      this.#merchantId
    }/customers/${id}?expand=emailAddresses`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    console.log(jsonData);
    if (jsonData.elements.length > 0) {
      this.customers = jsonData.elements.map((customer) => {
        const email =
          customer.emailAddresses?.elements[0]?.emailAddress || null;
        return {
          properties: {
            firstname: customer.firstName,
            lastname: customer.lastName,
            email: email,
          },
        };
      });

      if (this.customers.length > 0) {
        latestCustomerSince = this.customers[0]?.customerSince || null;
      }
    } else {
      latestCustomerSince = null;
    }

    return this.customers;
  }

  async getCloverCustomer(id) {
    const apiPath = `${this.#baseUrl}/${
      this.#merchantId
    }/customers/${id}?expand=emailAddresses`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    return jsonData;
  }

  async getPayments(limit = 100) {
    const apiPath = `${this.#baseUrl}/${
      this.#merchantId
    }/payments?limit=${limit}${
      latestPaymentCreatedTime ? `&createdTime>${latestPaymentCreatedTime}` : ""
    }`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    this.payments = jsonData.elements;
    if (this.payments.length > 0) {
      latestPaymentCreatedTime = this.payments[0]?.createdTime || null;
    }
    return this.payments;
  }
  async getOrders(limit = 100) {
    const apiPath = `${this.#baseUrl}/${
      this.#merchantId
    }/orders?limit=${limit}${
      latestOrderCreatedTime ? `&createdTime>${latestOrderCreatedTime}` : ""
    }`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    this.orders = jsonData.elements;
    if (this.orders.length > 0) {
      this.orders = await Promise.all(
        this.orders.map(async (order) => {
          const getdealname = await fetch(order.customers.elements[0].href, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${this.#accessToken}`,
            },
          });
          if (!getdealname.ok) {
            throw new Error(`HTTP error! status: ${getdealname.status}`);
          }
          const orderData = await getdealname.json();
          if (!orderData) {
            return null;
          }

          const dealname = `${orderData.firstName}_${orderData.lastName}`;
          const customerId = order.customers?.elements[0]?.id || null;
          const customer = await this.getCloverCustomer(customerId);
          const email =
            customer.emailAddresses?.elements[0]?.emailAddress || null;

          return {
            properties: {
              cloverid: order.id,
              dealname,
              pipeline: "default",
              dealstage: "contractsent",
              amount: order.total / 100,
            },
          };
        })
      );
      latestOrderCreatedTime = this.orders[0]?.createdTime || null;
    } else {
      latestOrderCreatedTime = null;
    }
    return this.orders;
  }
  async getInventory(limit = 100) {
    if (latestCountOfItems > 0) {
      return this.inventory;
    }

    const apiPath = `${this.#baseUrl}/${this.#merchantId}/items?limit=${limit}`;
    const response = await fetch(apiPath, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.#accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.elements.length > 0) {
      this.inventory = jsonData.elements.map((item) => {
        return {
          properties: {
            name: item.name,
            price: item.price,
            cloverid: item.id,
          },
          archived: item.deleted,
        };
      });
      latestCountOfItems = this.inventory.length;
    } else {
      latestCountOfItems = 0;
    }

    return this.inventory;
  }

  #searchObjectByKey = async (key, value, object) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/${
      this.#cloverHubspotObjectMapping[object]
    }/search`;

    console.log(apiPath);
    console.log(
      JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: key,
                operator: "EQ",
                value,
              },
            ],
          },
        ],
      })
    );

    const response = await fetch(apiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: key,
                operator: "EQ",
                value,
              },
            ],
          },
        ],
      }),
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    if (jsonData.results.length > 0) {
      return jsonData.results[0].id;
    } else {
      return null;
    }
  };

  #createHubSpotObject = async (item, object) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/${
      this.#cloverHubspotObjectMapping[object]
    }`;
    const response = await fetch(apiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.id) {
      console.log(
        `${this.#cloverHubspotObjectMapping[object]} created in HubSpot:`,
        jsonData
      );
    }
    return jsonData;
  };

  #updateObjectByKey = async (key, item, object) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/${
      this.#cloverHubspotObjectMapping[object]
    }/${key}`;
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.id) {
      console.log(
        `${this.#cloverHubspotObjectMapping[object]} updated in HubSpot:`,
        jsonData
      );
    }
    return jsonData;
  };

  async postCustomersToHubSpot() {
    if (this.customers.length === 0) {
      return;
    }

    await Promise.all(
      this.customers.map(async (customer) => {
        const email = customer.properties.email;
        if (email) {
          const id = await this.#searchObjectByKey("email", email, "customers");
          if (id) {
            await this.#updateObjectByKey(id, customer, "customers");
          } else {
            await this.#createHubSpotObject(customer, "customers");
          }
        }
      })
    );
  }

  async postItemsToHubSpot() {
    if (this.inventory.length === 0) {
      return;
    }

    await Promise.all(
      this.inventory.map(async (item) => {
        const cloverid = item.properties.cloverid;
        if (cloverid) {
          const id = await this.#searchObjectByKey(
            "cloverid",
            cloverid,
            "inventory"
          );
          if (id) {
            await this.#updateObjectByKey(id, item, "inventory");
          } else {
            await this.#createHubSpotObject(item, "inventory");
          }
        }
      })
    );
  }

  async associateDealsWithCustomers(customerId, dealId) {
    const apiPath = `${process.env.HUBSPOT_API_URL}/deals/${dealId}/associations/contacts/${customerId}/3`;
    const response = await fetch(apiPath, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    console.log("Deal associated with customer:", jsonData);
  }

  async postOrdersToHubspot() {
    if (this.orders.length === 0) {
      return;
    }

    await Promise.all(
      this.orders.map(async (order) => {
        const cloverid = order.properties.cloverid;
        const cloverCustomerId = order.properties.dealname.split("_")[2];

        if (cloverid) {
          const id = await this.#searchObjectByKey(
            "cloverid",
            cloverid,
            "orders"
          );
          let od = null;
          if (id) {
            od = await this.#updateObjectByKey(id, order, "orders");
          } else {
            od = await this.#createHubSpotObject(order, "orders");
          }

          const customerId = await this.#searchObjectByKey(
            "cloverid",
            cloverCustomerId,
            "customers"
          );

          console.log("customerId", customerId);

          if (customerId && od.id) {
            await this.associateDealsWithCustomers(customerId, od.id);
          }
        }
      })
    );
  }

  async postCustomerByEmail(email) {
    const customer = await this.#searchObjectByKey("email", email, "customers");
    console.log("customer", customer);
  }
}

async function fetchAndPostData() {
  try {
    console.log("Starting fetch and post process...");
    const cloverHubSpotAPI = new CloverHubSpotAPI();

    // await cloverHubSpotAPI.getCustomers(5);
    // await cloverHubSpotAPI.getInventory(5);
    await cloverHubSpotAPI.getOrders(2);
    // console.log(cloverHubSpotAPI.customers);
    console.log(cloverHubSpotAPI.orders);

    // Post customers and inventory to HubSpot
    // await cloverHubSpotAPI.postCustomersToHubSpot();
    // await cloverHubSpotAPI.postItemsToHubSpot();
    // await cloverHubSpotAPI.postOrdersToHubspot();
  } catch (error) {
    console.error("Error in fetchAndPostData:", error);
  }
}

// Run the fetch and post process immediately when the application starts
(async () => {
  console.log("Application started. Running initial fetch and post process...");
  await fetchAndPostData();
})();
