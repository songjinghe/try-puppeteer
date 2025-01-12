#!/usr/bin/env node
"use strict";

process.on("uncaughtException", (error) => {
  console.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, p) => {
  console.error(reason, p);
  process.exit(1);
});

function sleep(ms) {
  ms = ms ? ms : 0;
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Async route handlers are wrapped with this to catch rejected promise errors.
const catchAsyncErrors = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const fs = require("fs");
const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  console.error('errorHandler', err);
  res.status(500).send({errors: `Error running code. ${err}`});
});

var browser = false

async function initBrowser(){
  browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return browser
}

app.post(
  "/init",
  catchAsyncErrors(async (req, res, next) => {
    await initBrowser()

    res.status(200).json({
      isBase64Encoded: false,
      statusCode: httpStatusCode,
      headers: {},
      body: "browser initial",
    });
  })
);

app.post(
  "/invoke",
  catchAsyncErrors(async (req, res, next) => {
    const base64Str = req.body;
    console.log('base64String', base64Str)
    const jsonStr = Buffer.from(base64Str, 'base64').toString('utf-8');
    console.log('jsonString', jsonStr)
    const jsonObj = JSON.parse(jsonStr);
    const {url, size, mobile, delay} = jsonObj
    const [width, height] = size.split("x").map((v) => parseInt(v, 10));

    if(!browser) browser = await initBrowser()

    const page = await browser.newPage();
    page.setViewport({
      width: width || 800,
      height: height || 600,
      isMobile: mobile,
    });
    await page.goto(url, { waitUntil: "networkidle2" });
    await sleep(delay || 3000);
    const imgContent = await page.screenshot({ encoding: "base64", fullPage: false });

    res.status(200).json({
      isBase64Encoded: false,
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Transfer-Encoding': 'base64'
      },
      body: "data:image/png;base64,"+imgContent,
    });
  })
);

app.get("/", (req, res, next) => {
  res.status(200).send("It works!");
});

app.get(
  "/cleanup",
  catchAsyncErrors(async (req, res, next) => {
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));
    res.status(200).send("All pages closed");
  })
);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log("Press Ctrl+C to quit.");
});
