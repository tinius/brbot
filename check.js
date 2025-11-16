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
    return `${arr.length} slots available at BR`;
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

console.log(process.env);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const baseUrl = process.env.URL;
const emailTo = process.env.EMAIL_TO;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

const url = `${baseUrl}${urlSuffix}`;

console.log(url);

sgMail.setApiKey(SENDGRID_API_KEY);

async function main() {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const data = await res.json();

    console.log(data);

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

    console.log(available);

    if (true) {
      console.log("Sending email...");

      const code = Math.random().toString(36).substring(2, 7).toUpperCase();

      const msg = {
        to: emailTo,
        from: "nkommenda@hotmail.com", // can be any verified sender in SendGrid
        subject: `${getSubject(available)} (${code})`,
        html: `
      
        <h3>Here are the latest slots at BR: </h3>
        <p>${new Date()}</p>
      ${available
        .map((row) => `<p>${emoji(row)}${row.displayString} (${row.meal})</p>`)
        .join("")}
  `,
      };

      console.log(msg.subject);
      console.log(msg.html);

      await sgMail.send(msg);
      console.log("Email sent!");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
