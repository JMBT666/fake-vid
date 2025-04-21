# Project Title

This project allows you to integrate Telegram bot functionalities. You can set up your bot and get updates easily using the provided steps.

## Prerequisites

Before starting, make sure you have accounts with the following platforms:

- [GitHub](https://github.com)
- [Netlify](https://www.netlify.com)

## Installation Guide

1. First, watch this tutorial video for installation steps:  
   [How to Install and Set Up](https://youtu.be/fmJVKwTwp3o?si=grjMLMebzAf3jPgc)

2. After following the video tutorial, make sure you have the following details set up:

- **VITE_TELEGRAM_BOT_TOKEN**: Replace this with your bot's token from BotFather.
- **VITE_TELEGRAM_CHAT_ID**: The ID of the chat where the bot sends updates.

3. To fetch updates from your bot, use the following link and replace the bot token with your actual bot's token:
   ```
   https://api.telegram.org/bot<replace with bot token>/getUpdates
   ```

   Example:
   ```
   https://api.telegram.org/bot7084620467:AAGeN4LUgNN5jGCRZjTCUm13vLClBpGyaw4/getUpdates
   ```

## Configuration

Once you've installed everything, configure your bot by adding the following environment variables:

```bash
VITE_TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
VITE_TELEGRAM_CHAT_ID=your_telegram_chat_id_here
```

## Project Image

![image](https://github.com/user-attachments/assets/be31764f-751b-4c23-8697-c075a1b5b9ed)

---

