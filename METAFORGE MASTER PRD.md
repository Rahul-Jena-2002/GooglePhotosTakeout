# METAFORGE MASTER PRD

You are a senior Staff Software Engineer, Senior Product Designer, Senior UX Designer, Firebase Architect, SaaS Architect, and Conversion Optimization Expert.

Build a production-ready application called MetaForge.

Do not generate a prototype.

Do not generate placeholder architecture.

Design and implement a complete production-ready application.

The application must feel like a premium desktop application running inside the browser.

The final quality target should be comparable to Apple, Linear, Raycast, Arc Browser, and modern SaaS products.

---

# PRODUCT OVERVIEW

MetaForge restores metadata from Google Takeout exports.

Users provide:

* Google Takeout export folder
* Output folder

MetaForge:

* Matches media files with metadata JSON files
* Restores available metadata
* Performs Deep EXIF Injection
* Generates restored media files
* Processes everything locally on the user's device

No media files are uploaded.

No cloud processing occurs.

Privacy is a core product feature.

---

# CORE PRODUCT PROMISE

The application must repeatedly reinforce:

Files never leave your device.

No uploads.

No cloud processing.

Runs locally inside your browser.

99.99% recovery accuracy.

Deep EXIF Injection.

---

# TECH STACK

Frontend:

React
TypeScript
Vite

UI:

Tailwind CSS
shadcn/ui

Animation:

Framer Motion

Backend Services:

Firebase Hosting
Firebase Authentication
Firestore
Firebase Analytics

Processing:

Web Workers
File System Access API

Themes:

Dark Theme
Light Theme

Do NOT use:

Next.js
Spring Boot
SQL
SMTP
EmailJS
Formspree
Three.js

---

# DESIGN PHILOSOPHY

The application should feel:

Professional

Premium

Minimal

Fast

Trustworthy

Not flashy.

Not crypto-style.

Not AI-bro style.

Not overloaded with gradients.

Use:

80% Minimal Design

20% Frosted Glass

Glass effects only on:

Navbar

Pricing Cards

Support Widget

---

# ROUTES

/

Landing Page

/tool

Processing Workspace

/pricing

Pricing

/how-it-works

Technical Explanation

/privacy

Privacy Policy

/terms

Terms

/reviews

Reviews

/dashboard

User Dashboard

/admin

Admin Dashboard

---

# LANDING PAGE STRUCTURE

Single-page experience.

Sections:

Hero

Trust Metrics

Problem

Solution

Privacy

How It Works

Reviews

Pricing

FAQ

Footer

---

# HERO

Headline:

Restore Metadata From Google Takeout

Subheadline:

Restore original dates, locations and metadata directly on your device.

Trust Bullets:

99.99% Recovery Accuracy

Deep EXIF Injection

Files Never Leave Your Device

Local Browser Processing

Primary Button:

Start Free

Secondary Button:

See How It Works

---

# TRUST METRICS

Display:

Files Restored

TB Processed

Recovery Success Rate

Tickets Resolved

Values stored in Firestore.

---

# PRIVACY REQUIREMENTS

Landing Page must contain privacy messaging.

Tool Page must contain privacy messaging.

FAQ must contain privacy messaging.

Privacy Page must contain full details.

Information Collected:

Google account information

Purchase information

Support tickets

Anonymous analytics

Recovery statistics

Information NOT Collected:

Photos

Videos

EXIF metadata

GPS coordinates

File contents

Folder contents

Album contents

Personal media

State clearly:

MetaForge never uploads your files.

---

# AUTHENTICATION

Google Sign-In only.

Do not implement:

Password login

Username login

Password reset

Email verification

---

# PLAN STRUCTURE

All plans use the EXACT SAME recovery engine.

Recovery quality must NEVER vary by plan.

Paid plans only unlock:

Higher limits

Visibility

Analysis

History

Support

Ad-free experience

---

# FREE PLAN

Price:

₹0

Limits:

1000 Files OR 1GB

Ads Required

AdBlock Not Allowed

Support Tickets Disabled

Visible Features:

Metadata Recovery

Deep EXIF Injection

Live Processing Activity Feed

Processing Logs

Results Summary

Visible Support Options:

FAQ

Documentation

Upgrade For Support

Hidden:

Raise Ticket

My Tickets

Recovery History

Metadata Viewer

Duplicate Detection

---

# RECOVERY PASS

Price:

₹99

One-Time Recovery

Limits:

20GB OR 20,000 Files

Ads Required

AdBlock Not Allowed

Support Enabled

Visible Features:

Everything Free Has

Folder Organization

Large Export Processing

Processing Logs

Support Access

Visible Support Options:

Raise Ticket

My Tickets

FAQ

Response Time:

24–48 Business Hours

Monday–Friday

---

# PRO PLAN

Price:

₹799 Lifetime

Ads Required

AdBlock Not Allowed

Unlimited Processing

Support Enabled

Priority Queue

Badge:

Most Popular

Visible Features:

Everything Recovery Pass Has

Unlimited Processing

Recovery History

Recovery Statistics

Support Priority

---

# SUPER PLAN

Price:

₹1499 Lifetime

Unlimited Processing

No Ads

AdBlock Allowed

Highest Support Priority

Visible Features:

Everything Pro Has

Metadata Viewer

Metadata Comparison

Duplicate Detection

Advanced Recovery Details

Ad-Free Experience

Important:

Do NOT claim Super restores more metadata.

It only provides visibility into recovered metadata.

---

# TOOL WORKSPACE

Must feel like desktop software.

Workflow:

Select Takeout Folder

Select Output Folder

Scan

Process

Results

---

# PROCESSING SCREEN

Display:

Files Processed

Matched

Recovered

Unmatched

Failed

Current File

Files Per Second

ETA

Progress Percentage

---

# PROCESSING ACTIVITY FEED

Visible to all plans.

Show hierarchy:

Google Photos

└── Photos From 2020

```
└── Vacation

    ✓ IMG_12345.jpg Found

    ✓ Metadata Found

    ✓ Metadata Restored

    ✓ EXIF Injected
```

Failure Example:

```
    ✗ Metadata Missing

    ✗ Recovery Failed
```

Colors:

Green = Success

Yellow = Warning

Red = Failure

Only keep last 200 entries rendered.

Store full log internally.

Provide:

Download Processing Log

after completion.

---

# RESULTS PAGE

Display:

Files Scanned

Matched

Recovered

Failed

Duration

Success Rate

Download Processing Log

---

# RECOVERY HISTORY

Visible only for:

Pro

Super

Display:

Recovery Date

Files Processed

Duration

Success Rate

---

# METADATA VIEWER

Visible only for:

Super

Display:

Date Taken

GPS

Camera Information

Lens Information

Album Information

Description

People Tags

Status:

Recovered

Not Available

Missing

Show source:

Recovered From:
metadata.json

Never imply metadata existed when it was not present.

---

# DUPLICATE DETECTION

Visible only for:

Super

Display:

Duplicates Found

Potential Space Savings

---

# ADBLOCK POLICY

Landing page loads normally.

When user enters tool:

Check for AdBlock.

If user plan is:

Free
Recovery Pass
Pro

Require ads.

Show modal:

MetaForge is supported by advertising.

Advertising helps fund development while keeping processing local.

Disable AdBlock to continue.

Buttons:

I've Disabled AdBlock

Upgrade To Super

Do not load processing workspace until requirement passes.

Super users bypass this restriction.

---

# SUPPORT SYSTEM

Entirely inside application.

Do NOT use:

Email

SMTP

EmailJS

External support systems

Everything uses Firestore.

---

# FREE SUPPORT

No ticket creation.

Show:

FAQ

Documentation

Upgrade For Support

---

# PAID SUPPORT

Recovery Pass

Pro

Super

Can create tickets.

Response Time:

24–48 Business Hours

Monday–Friday

---

# TICKET STATUS

OPEN

IN_PROGRESS

RESOLVED

CLOSED

---

# SUPPORT WIDGET

Visible globally.

Bottom-right.

Free User:

FAQ

Documentation

Upgrade

Paid User:

Raise Ticket

My Tickets

FAQ

---

# ADMIN PANEL

Protected Route

Admin Only

Sections:

Dashboard

Users

Revenue

Tickets

Reviews

Statistics

Settings

---

# ADMIN DASHBOARD CARDS

Total Users

Revenue

Files Restored

TB Processed

Open Tickets

Closed Tickets

Plan Sales

---

# FIRESTORE COLLECTIONS

users

tickets

reviews

stats

purchases

recoveryHistory

appSettings

---

# PERFORMANCE REQUIREMENTS

Lighthouse:

95+

Target:

FCP < 1.5s

LCP < 1.5s

CLS < 0.01

TBT = 0

Landing page bundle should remain lightweight.

Load order:

Landing

Tool UI

Support

Pricing

Reviews

Metadata engine, EXIF engine and Web Workers should load only when entering the tool.

---

# ANIMATION RULES

Use Framer Motion only.

Allowed:

Fade In

Fade Up

Slide Up

Hover Scale

Hover Lift

Page Fade

Duration:

200ms–400ms

Avoid:

Bounce

Spinning

Infinite Floating

Heavy Parallax

Three.js

---

# FINAL GOAL

Users should immediately believe:

This looks professional.

My files are safe.

I understand what is happening.

I trust this application.

This is worth paying for.

Build the complete application architecture, UI, components, pages, Firestore structure, state management, feature gating, dashboards, support system, admin system, and responsive design according to this specification.



# METAFORGE V3 - COMPLETE PRODUCT SPECIFICATION WITH USER-VISIBLE PLAN DIFFERENTIATION

## CRITICAL REQUIREMENT

The website must clearly communicate what each user actually sees and experiences.

Do NOT describe plans using internal technical terminology only.

The pricing page, dashboard, support system, tool workspace, and feature visibility must change based on the user's plan.

The AI must implement feature gating and UI visibility exactly as described below.

---

# CORE PRODUCT

MetaForge restores metadata from Google Takeout exports.

All plans use the EXACT SAME recovery engine.

Recovery quality must NEVER be reduced based on plan.

Recovery accuracy must be identical across all plans.

Paid plans unlock:

* Higher limits
* Better visibility
* Better convenience
* Better support
* Better reporting
* Ad-free experience

NOT better recovery quality.

This must be communicated throughout the website.

---

# USER TYPES

There are four user types:

1. Free User
2. Recovery Pass User
3. Pro User
4. Super User

The UI should adapt based on plan.

---

# FREE USER EXPERIENCE

## Plan Details

Price:

₹0

Limits:

1000 Files OR 1GB

Ads Required

AdBlock Not Allowed

No Support Tickets

---

## What Free User Sees

Dashboard:

Current Plan:
Free

Usage:
634 / 1000 Files

or

0.7GB / 1GB

Progress Bar Visible

Upgrade Button Visible

---

Tool Workspace:

Visible:

✓ Select Folder

✓ Scan

✓ Process

✓ Progress Bar

✓ Activity Feed

✓ Download Processing Log

---

Results Screen:

Files Scanned

Matched

Recovered

Failed

Duration

---

Support Widget

Visible:

FAQ

Documentation

Upgrade For Support

Hidden:

Raise Ticket

My Tickets

Support History

---

Pricing Card

Display:

Good for trying MetaForge

Restore metadata from small exports

Up to 1000 files or 1GB

---

# RECOVERY PASS USER EXPERIENCE

## Plan Details

Price:

₹99

One-Time Recovery

Limits:

20GB OR 20,000 Files

Ads Required

AdBlock Not Allowed

Support Included

---

## What Recovery Pass User Sees

Dashboard:

Current Plan:
Recovery Pass

Remaining Capacity

20GB / 20GB

or

20,000 / 20,000 Files

Usage Statistics

---

Tool Workspace

Visible:

✓ Everything Free Users Have

✓ Folder Organization

✓ Large Export Support

✓ Full Activity Feed

✓ Processing Log Download

---

Results Screen

Files Scanned

Matched

Recovered

Failed

Duration

Folder Organization Results

---

Support Widget

Visible:

Raise Ticket

My Tickets

FAQ

---

Ticket Access

Enabled

Response Time:

24–48 Business Hours

Monday–Friday

---

Pricing Card

Display:

Best for one-time Google Takeout recovery

Process up to 20GB or 20,000 files

Includes support access

---

# PRO USER EXPERIENCE

## Plan Details

Price:

₹799 Lifetime

Ads Required

AdBlock Not Allowed

Unlimited Processing

Support Included

Priority Queue

Most Popular

---

## What Pro User Sees

Dashboard

Current Plan:
Pro Lifetime

Unlimited Processing

Plan Badge:
Most Popular

---

Tool Workspace

Visible:

✓ Everything Recovery Pass Has

✓ Unlimited Processing

✓ Recovery History

✓ Recovery Statistics

---

Recovery History Section

Visible only for Pro and Super.

Example:

Recovery #1

20,000 Files

Success Rate:
99.9%

Date:
May 12 2026

---

Recovery #2

35,000 Files

Success Rate:
99.8%

Date:
June 03 2026

---

Support Widget

Visible:

Raise Ticket

My Tickets

FAQ

Priority Queue Badge

---

Pricing Card

Display:

Unlimited metadata restoration

Perfect for large photo libraries

Includes recovery history

---

# SUPER USER EXPERIENCE

## Plan Details

Price:

₹1499 Lifetime

Unlimited Processing

No Ads

AdBlock Allowed

Highest Support Priority

---

## Important

Do NOT claim Super restores more metadata.

Recovery quality remains identical.

Super provides visibility and analysis.

---

## What Super User Sees

Dashboard

Current Plan:
Super Lifetime

No Ads

Premium Features Enabled

---

Tool Workspace

Visible:

✓ Everything Pro Has

✓ Metadata Viewer

✓ Metadata Comparison

✓ Duplicate Detection

✓ Advanced Recovery Details

---

Metadata Viewer

User clicks any processed file.

Display:

File:
IMG_12345.jpg

Date Taken

✓ Recovered

Source:
metadata.json

GPS

✓ Recovered

Source:
metadata.json

Camera Information

⚠ Not Available

Not Present In Source Metadata

Album Information

✓ Recovered

Source:
metadata.json

---

Metadata Comparison

Before

Date:
Missing

GPS:
Missing

Camera:
Missing

After

Date:
Recovered

GPS:
Recovered

Camera:
Not Available

---

Advanced Recovery Details

Display:

Photos Processed:
20,000

Dates Recovered:
19,980

GPS Recovered:
14,302

Albums Recovered:
8,421

Camera Data Recovered:
5,132

Failed:
20

---

Duplicate Detection

Display:

Duplicates Found:
1,423

Potential Space Savings:
3.4GB

---

Support Widget

Visible:

Raise Ticket

My Tickets

FAQ

Highest Priority Badge

---

Pricing Card

Display:

See exactly what metadata was recovered

Analyze recovered data

Remove duplicates

Ad-free experience

---

# ADBLOCK BEHAVIOR

Free User

Blocked

Must disable AdBlock

---

Recovery Pass User

Blocked

Must disable AdBlock

---

Pro User

Blocked

Must disable AdBlock

---

Super User

Allowed

No AdBlock restrictions

---

# SUPPORT SYSTEM

Free Users

No Tickets

Only FAQ

Only Documentation

---

Recovery Pass

Tickets Enabled

---

Pro

Tickets Enabled

Priority Queue

---

Super

Tickets Enabled

Highest Priority Queue

---

Response Time Text Everywhere

Typical Response Time

24–48 Business Hours

Monday–Friday

---

# PROCESSING LOGS

Available To All Plans

During Processing:

Show live activity feed.

Example:

Google Photos

└── Photos From 2020

```
└── Vacation

    ✓ IMG_12345.jpg Found

    ✓ Metadata Found

    ✓ Metadata Restored

    ✓ EXIF Injected
```

---

Failure Example

Google Photos

└── Photos From 2020

```
└── Vacation

    ✓ IMG_12346.jpg Found

    ✗ Metadata Missing

    ✗ Recovery Failed
```

---

Color Rules

Green:

Success

Yellow:

Warning

Red:

Failure

Only render last 200 visible events.

Store full log internally.

---

# FINAL PRICING PAGE MESSAGE

Every plan uses the same recovery engine.

Every plan receives the same metadata restoration quality.

Paid plans unlock:

Higher Limits

History

Analysis Tools

Support Access

Convenience Features

Ad-Free Experience

Recovery quality never changes between plans.

This statement must appear on the pricing page to build trust.


# SUPPORT ACCESS BY PLAN

## FREE

Price:

₹0

Support Access:

✗ Support Tickets

✓ FAQ

✓ Documentation

✓ How It Works Guide

Users can:

* Read FAQ
* Read troubleshooting guides
* Read common error solutions

Users cannot:

* Create support tickets
* Contact support directly

---

## RECOVERY PASS

Price:

₹99

Support Access:

✓ Support Tickets

Response Time:

24–48 Business Hours

Monday–Friday

Users can:

* Create tickets
* View ticket status
* Receive admin replies
* Access FAQ

---

## PRO LIFETIME

Price:

₹799

Support Access:

✓ Support Tickets

Priority Queue

Response Time:

24–48 Business Hours

Monday–Friday

Users can:

* Create tickets
* View ticket history
* Receive admin replies
* Access FAQ

Priority Level:

Higher than Recovery Pass

---

## SUPER LIFETIME

Price:

₹1499

Support Access:

✓ Priority Support

Highest Priority Queue

Response Time:

24–48 Business Hours

Monday–Friday

Users can:

* Create tickets
* View ticket history
* Receive admin replies
* Access FAQ

Priority Level:

Highest

---

# SUPPORT WIDGET BEHAVIOR

FREE USER

Support Widget:

FAQ

Documentation

Upgrade For Support

No Raise Ticket button.

---

RECOVERY PASS USER

Support Widget:

Raise Ticket

My Tickets

FAQ

---

PRO USER

Support Widget:

Raise Ticket

My Tickets

FAQ

Priority Queue Badge

---

SUPER USER

Support Widget:

Raise Ticket

My Tickets

FAQ

Highest Priority Badge

