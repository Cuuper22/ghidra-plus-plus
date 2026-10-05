# Getting started

Ghidra++ lets you look inside a compiled program, the kind of file you double-click to run, without running it. This page goes from download to your first named function.

## Start Ghidra++

Download the Windows ZIP from the [v0.2.0 release](https://github.com/Cuuper22/ghidra-plus-plus/releases/tag/v0.2.0), extract it to a new folder, and double-click `ghidra-plus-plus.bat`. Your browser opens the workspace. The ZIP includes Ghidra 12.1.4 and Java 25, so there is nothing else to install. Keep the launcher window open while you work.

If the browser does not open, copy the `Ghidra++ workspace:` link from the launcher window into your browser. Keep that link to yourself: it contains a private key for this session.

## Try the example

1. Click **Try the example**. Ghidra reads `parcel.exe`, a tiny shipping-cost calculator, and splits it into functions. A function is a small piece of a program that does one job.
2. Start with the function marked **Start** at the top of the list. The **Connections** tab shows which functions it uses. Click any box to open that function.
3. The panel on the right, **About this function**, lists facts from Ghidra in plain words: how many inputs the function takes, what it gives back, which functions it uses, which functions use it, and any text inside it. Find the function that contains `Parcel priority delivery`.
4. Open the **Code** tab to read the C code Ghidra rebuilt from the machine code. Names such as `param_1` and `local_18` are placeholders, because the original names are gone.
5. Click **Rename** and give a function a name that says what it does, such as `read_number`. The new name shows up everywhere at once.

The example's original source, [`parcel.c`](../Ghidra/Features/GhidraPlusPlus/examples/parcel.c), is in the `GhidraPlusPlus-examples` folder so you can check your guesses afterwards. Ghidra++ never reads it.

To look at your own program, click **Open a program**, or **Open program** in the toolbar, and pick an `.exe` or `.dll` file. Ghidra++ never runs it.

## Turn on descriptions and name suggestions

Everything above works without an account. With a [TypeSafe](https://typesafe.ai/) API key, Ghidra++ also writes a one-line description of each function and suggests a name when a common one fits.

Click **Turn them on** in the blue banner, or the gear button, paste your key, and click **Save key**. Then click **Describe functions**. Programs you open later are described automatically. You can also set `TYPESAFE_API_KEY` before starting Ghidra++. The key lasts until Ghidra++ closes and is never saved in your project.

Each description says how sure TypeSafe is: **Very likely**, **Probably**, or **Not sure**. A description it is not sure about is shown as a **Best guess**. A small sparkle in the function list marks functions with a suggested name. Open one, read **Why this name?**, and click **Use this name** if it fits. **Undo** puts the old name back. Treat suggestions as hints and check them in the Code tab.

TypeSafe picks from 16 kinds of jobs and a short list of common names, so many functions get a description and no suggested name. Name those yourself. After you rename a function, suggestions for the functions that use it can become **Out of date**; click **Describe functions** again for fresh ones.

To describe functions, Ghidra++ sends short excerpts of each function's rebuilt code and assembly, its details, and the text inside it to [TypeSafe's API](https://docs.typesafe.ai/api). The program file and your project stay on your computer. Check TypeSafe's site for pricing and terms.

**Settings → Advanced** changes the order functions are described in and how much code is sent for each one. The defaults suit most programs.

## Save, export, and come back later

Names you set or accept are saved as you go, and **Save** writes everything to the Ghidra project. To pick up later, start Ghidra++ and open the same file again; your names and descriptions come back. Projects live in `Documents/Ghidra++ Projects` under your home folder.

**Export → Rebuilt code** downloads every function as one `.c` file. **Export → Analysis report** downloads the functions, descriptions, and names as JSON. The rebuilt code helps you read the program; it is not the original source and may not compile.

## Go deeper in full Ghidra

Click **Open in full Ghidra** in a function's panel to open it in Ghidra's classic CodeBrowser, with all of Ghidra's tools. Both windows work on the same program, so a rename in one shows up in the other. To come back, choose **Tools → Ghidra++ → Open Investigation**. Full Ghidra is unavailable when Ghidra++ was started with `--headless`.

The launcher enables the Ghidra++ plugin for you. If you start Ghidra through `ghidraRun.bat` instead and the menu entry is missing, open **File → Configure…**, choose **Configure All Plugins**, and enable `GhidraPlusPlusPlugin`.

The **?** button explains the main terms and turns the tips on or off. For batch use, the launcher accepts `--open PROGRAM --output DIR` and writes `analysis.json` and `reconstructed.c`. [How It Works](how-it-works.md) covers the other options and the MCP adapter for AI agents.
