import "dotenv/config";

import fetch from "node-fetch";
import sgMail from "@sendgrid/mail";
import _ from "lodash";

const highPrio = (resi) => {
  return (
    resi.meal === "Dinner" &&
    ["Thursday", "Friday", "Saturday"].indexOf(
      resi.displayString.split(",")[0]
    ) >= 0
  );
};

const emoji = (resi) => {
  if (highPrio(resi)) {
    return `⚠️ `;
  } else {
    return "";
  }
};

const getSubject = (arr) => {
  if (arr.filter(highPrio).length > 0) {
    return "⚠️⚠️⚠️ Great slot available at BR";
  } else {
    return `${arr.length} slot${arr.length === 1 ? "" : "s"} available at BR`;
  }
};

const format = (o) => {
  const dateStr = o.time_iso.slice(0, 10);
  const date = new Date(dateStr);

  const options = { weekday: "long", month: "short", day: "numeric" };
  const formatted = date.toLocaleDateString("en-US", options);

  //console.log(formatted); // 👉 "Tuesday, Dec 16"

  return `${o.time} on ${formatted}`;
};

const urlSuffix =
  "&time_slot=18:00&party_size=2&halo_size_interval=24&start_date=11-26-2025&num_days=28&channel=SEVENROOMS_WIDGET&selected_lang_code=en";

//console.log(process.env);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const gistId = process.env.GIST_ID;
const token = process.env.GIST_TOKEN;
const gistUrl = `https://api.github.com/gists/${gistId}`;

async function getState() {
  const res = await fetch(gistUrl, {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch gist: ${res.status}`);
  const gist = await res.json();
  const file = gist.files["br_data.json"];
  return JSON.parse(file.content);
}

async function setState(newState) {
  const body = {
    files: {
      "br_data.json": { content: JSON.stringify(newState, null, 2) },
    },
  };
  const res = await fetch(gistUrl, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      `Failed to update gist: ${res.status}, ${await res.text()}`
    );
}

const baseUrl = process.env.URL;
const emailTo = process.env.EMAIL_TO;
const emailFrom = process.env.EMAIL_FROM;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

const url = `${baseUrl}${urlSuffix}`;

console.log("token", token);

sgMail.setApiKey(SENDGRID_API_KEY);

async function main() {
  try {
    const oldState = await getState();
    // console.log(`Old state: ${JSON.stringify(oldState)}`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const data = await res.json();

    //console.log(data);

    const dates = Object.keys(data.data.availability);

    const available = _.flattenDeep(
      dates.map((k) => {
        const dayArr = data.data.availability[k];

        if (dayArr.length < 2) {
          return [];
        }

        const [lunch, dinner] = dayArr;

        return [
          ...lunch.times
            .filter((row) => row.policy)
            .map((o) => {
              return { ...o, meal: "Lunch" };
            }),
          ...dinner.times
            .filter((row) => row.policy)
            .map((o) => {
              return { ...o, meal: "Dinner" };
            }),
        ];
      })
    ).map((o) => {
      return {
        displayString: format(o),
        meal: o.meal,
      };
    });

    console.log("-----");
    console.log(available);
    console.log(oldState.available);
    console.log("-----");

    if (available.length > 0 && !_.isEqual(available, oldState.available)) {
      console.log("Sending email...");

      const code = Math.random().toString(36).substring(2, 7).toUpperCase();

      const msg = {
        to: emailTo,
        from: emailFrom, // can be any verified sender in SendGrid
        subject: `${getSubject(available)} (#${code})`,
        html: `
      
        <h3>Here are the latest slots at BR: </h3>
      ${available
        .map((row) => `<p>${emoji(row)}${row.displayString} (${row.meal})</p>`)
        .join("")}

        <p>------</p>
        <p><em>Sent on ${new Date()}</em></p>
  `,
      };

      console.log(msg.subject);
      console.log(msg.html);

      await sgMail.send(msg);
      console.log("Email sent!");
    }

    await setState({ time: new Date(), available });
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
