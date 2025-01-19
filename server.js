import express from 'express';
import puppeteer from 'puppeteer';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import csvWriter from 'csv-write-stream';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Middleware to handle scraping requests
app.post("/scrape", async (req, res) => {
    const { keywords, page = 1, lci } = req.body; // Extract lci value, page and keywords from the request
    const allResults = [];
    const TIMEOUT = 30000; // Increased timeout (30 seconds)

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: "Please provide a valid array of keywords." });
    }

    if (lci === undefined) {
        return res.status(400).json({ error: "LCI value must be provided." });
    }

    try {
        console.log("Starting the scraping process...");

        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: [
                "--no-sandbox", 
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--remote-debugging-port=9222"
            ],
        });

        for (const keyword of keywords) {
            console.log(`Scraping results for keyword: ${keyword}`);
            const pageInstance = await browser.newPage();
            pageInstance.setDefaultNavigationTimeout(TIMEOUT);

            let pageNumber = page;
            let isLastPage = false;

            // Start scraping and go through all pages
            while (!isLastPage) {
                console.log(`Scraping page ${pageNumber} for keyword: ${keyword}`);

                // Open the URL for the current page with the dynamic 'lci' value
                const url = `https://www.google.com/localservices/prolist?hl=en-GB&gl=uk&ssta=1&q=${encodeURIComponent(keyword)}&oq=${encodeURIComponent(keyword)}&src=2&page=${pageNumber}&lci=${lci}`;
                await pageInstance.goto(url, { waitUntil: 'networkidle2' });

                // Scrape the current page data
                const keywordResults = await getPageData(pageInstance);
                allResults.push(...keywordResults);
                console.log(`Scraped ${keywordResults.length} results from page ${pageNumber}.`);

                // Check if there is a "Next" page button
                isLastPage = await pageInstance.evaluate(() => {
                    const nextButton = document.querySelector('button[jsname="LgbsSe"]');
                    return !nextButton; // If no next button, we're on the last page
                });

                if (!isLastPage) {
                    pageNumber++; // Go to the next page
                    await pageInstance.waitForTimeout(3000); // Wait before loading the next page
                }
            }

            await pageInstance.close();
        }

        await browser.close();

        console.log("Scraping completed. Generating CSV file...");

        // Generate the CSV file
        const filePath = './scraped_data.csv';
        const writer = csvWriter({ headers: ['Name', 'Address', 'Phone', 'Website', 'Email', 'Reviews', 'Rating', 'Business Hours', 'Services'] });
        writer.pipe(fs.createWriteStream(filePath));
        allResults.forEach(result => writer.write(result));
        writer.end();

        console.log("CSV file generated successfully.");
        res.json({ success: true, data: allResults, file: filePath });

    } catch (error) {
        console.error("Error during scraping:", error);
        res.status(500).json({ error: "An error occurred while scraping." });
    }
});

// GET API endpoint to test the server
app.get("/test", (req, res) => {
    res.json({ message: "The server is running correctly!" });
});

// Function to extract data from the page
const getPageData = async (page) => {
    return await page.evaluate(async () => {
        const organicCards = Array.from(document.querySelectorAll('div[data-test-id="organic-list-card"]'));
        let cardData = [];

        console.log(`Found ${organicCards.length} cards on this page.`);

        for (const card of organicCards) {
            try {
                // Click on the card to expand the details
                await card.querySelector('div[role="button"] > div:first-of-type').click();
                await new Promise(resolve => setTimeout(() => resolve(), 1000));  // Wait for the card to load

                const name = document.querySelector(".tZPcob") ? document.querySelector(".tZPcob").innerText : "NONE";
                const phoneNumber = document.querySelector('[data-phone-number][role="button"][class*=" "]') 
                    ? document.querySelector('[data-phone-number][role="button"][class*=" "]').querySelector("div:last-of-type").innerHTML 
                    : "NONE";
                const website = document.querySelector(".iPF7ob > div:last-of-type") 
                    ? document.querySelector(".iPF7ob > div:last-of-type").innerHTML 
                    : "NONE";
                const address = document.querySelector(".fccl3c") 
                    ? document.querySelector(".fccl3c").innerText 
                    : "NONE";

                // Extract reviews, rating, business hours, and services
                const reviews = document.querySelector('.PN9vWe') ? document.querySelector('.PN9vWe').innerText : "NONE";
                const rating = document.querySelector('.ZjTWef') ? document.querySelector('.ZjTWef').innerText : "NONE";
                // const services = document.querySelector('.OyjIsf') ? document.querySelector('.OyjIsf').innerText : "NONE";
                const email = document.querySelector('.email-class-selector') ? document.querySelector('.email-class-selector').innerText : "NONE"; // Assuming an email selector

                cardData.push({
                    name,
                    address,
                    phone: phoneNumber === "NONE" ? phoneNumber : phoneNumber,
                    website,
                    email,
                    reviews,
                    rating,
                    // services,
                });
            } catch (e) {
                console.log(`Error in processing card: ${e}`);
            }
        }

        return cardData;
    });
};

const PORT = 5010;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
