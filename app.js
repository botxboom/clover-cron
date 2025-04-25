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
      latestOrderCreatedTime = this.orders[0]?.createdTime || null;
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

  #searchContactByEmail = async (email) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/contacts/search`;
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
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.results.length > 0) {
      return jsonData.results[0].id;
    } else {
      return null;
    }
  };

  #createHubSpotContact = async (customer) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/contacts`;
    const response = await fetch(apiPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(customer),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.id) {
      console.log("Customer created in HubSpot:", jsonData);
    }
    return jsonData;
  };

  #updateCustomer = async (customerId, customer) => {
    const apiPath = `${process.env.HUBSPOT_API_URL}/contacts/${customerId}`;
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(customer),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData.id) {
      console.log("Customer updated in HubSpot:", jsonData);
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
          const id = await this.#searchContactByEmail(email);
          if (id) {
            await this.#updateCustomer(id, customer);
          } else {
            await this.#createHubSpotContact(customer);
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
        const apiPath = `${process.env.HUBSPOT_API_URL}/products`;
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
          console.log("Item created in HubSpot:", jsonData);
        }
      })
    );
  }
}

async function fetchAndPostData() {
  try {
    console.log("Starting fetch and post process...");
    const cloverHubSpotAPI = new CloverHubSpotAPI();
    // Fetch customers, payments, and orders from Clover
    await cloverHubSpotAPI.getCustomers();
    // await cloverHubSpotAPI.getInventory();

    // Post customers and inventory to HubSpot
    await cloverHubSpotAPI.postCustomersToHubSpot();
  } catch (error) {
    console.error("Error in fetchAndPostData:", error);
  }
}

// Run the fetch and post process immediately when the application starts
(async () => {
  console.log("Application started. Running initial fetch and post process...");
  await fetchAndPostData();
})();
