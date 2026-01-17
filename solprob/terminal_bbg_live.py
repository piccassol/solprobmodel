# terminal_bbg_live.py — Bloomberg-ish Text UI (single-grid mosaic)
# Keys:
#   q = quit   r = refresh now   p = pause/resume
#   d = toggle diagnostics       s = start Streamlit (app_bbg.py)
#
# Deps: textual>=0.46, plotext, pandas, numpy, requests, python-dotenv

import argparse
import os
import shutil
import sys
from datetime import datetime, timezone
from subprocess import Popen, PIPE, STDOUT, run

import numpy as np
import pandas as pd
import plotext as plt
import requests
from dotenv import load_dotenv

from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Static
from textual.containers import Grid

# ---------- helpers ----------

def ascii_line(series, width=62, height=14):
    try:
        y = list(map(float, series))
    except Exception:
        y = [0.0] * len(series)
    plt.clear_figure()
    plt.plotsize(width, height)
    plt.plot(y, marker=None)
    try: plt.frame(False)
    except: pass
    for fn, args in (("axes",(False,)), ("axis",(False,)), ("ticks",(False,False))):
        try:
            getattr(plt, fn)(*args); break
        except Exception:
            continue
    try:
        text = plt.build()
    finally:
        plt.clear_figure()
    return text

def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df.sort_values("timestamp").reset_index(drop=True)

# ---------- widgets ----------

class ChartBox(Static):
    def set(self, title: str, value: str, series, w=62, h=14):
        self.update(f"[black on #ffb000] {title} [/]\n[bold]{value}[/bold]\n{ascii_line(series, w, h)}")

class Tape(Static):
    def set(self, text: str): self.update(text)

class Diag(Static): pass

# ---------- app ----------

class BBGApp(App):
    CSS = """
    Screen { background: #0c0f10; color: #e6e6e6; }
    #tape   { height: 3; border: tall #3a3f44; background: #101417; }
    #footer { height: 3; border: tall #3a3f44; background: #101417; color: #cfd7e1; }
    .panel  { border: round #1f6feb; background: #0e1214; padding: 0 1; }
    #diag   { border: round #ffb000; background: #0d1113; padding: 0 1; }
    #grid {
      grid-size: 3 3;               /* 3 columns x 3 rows */
      grid-columns: 1fr 1fr 1fr;
      grid-rows: 1fr 1fr 1fr;
      gap: 1 1;
      height: 1fr;
      padding: 0 1;
    }
    /* place areas */
    #price { grid-column: 1; grid-row: 1; }
    #vol   { grid-column: 2; grid-row: 1; }
    #vol24 { grid-column: 1; grid-row: 2; }
    #dd    { grid-column: 2; grid-row: 2; }
    #diag  { grid-column: 3; grid-row: 1 / span 3; } /* tall diag on right */
    #minia { grid-column: 1; grid-row: 3; }
    #minib { grid-column: 2; grid-row: 3; }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh", "Refresh"),
        ("p", "toggle_pause", "Pause/Resume"),
        ("d", "toggle_diag", "Diagnostics"),
        ("s", "open_streamlit", "Open Streamlit"),
    ]

    def __init__(self, args):
        super().__init__()
        self.args = args
        self.paused = False
        self.show_diag = True
        self.df = None

    def compose(self) -> ComposeResult:
        yield Header()
        self.tape = Tape(id="tape")
        yield self.tape
        self.g = Grid(id="grid")

        self.c_price = ChartBox(id="price", classes="panel")
        self.c_vol   = ChartBox(id="vol",   classes="panel")
        self.c_vol24 = ChartBox(id="vol24", classes="panel")
        self.c_dd    = ChartBox(id="dd",    classes="panel")
        self.k_a     = ChartBox(id="minia", classes="panel")
        self.k_b     = ChartBox(id="minib", classes="panel")
        self.diag    = Diag(id="diag")

        self.g.mount(self.c_price, self.c_vol, self.c_vol24, self.c_dd, self.k_a, self.k_b, self.diag)
        yield self.g

        self.footer = Static(classes="panel", id="footer")
        yield self.footer
        yield Footer()

    def on_mount(self):
        self.refresh_all()
        self.set_interval(6, self.on_tick)

    def on_tick(self):
        if not self.paused:
            self.refresh_all()

    def action_toggle_pause(self):
        self.paused = not self.paused
        self.notify(f"Auto-refresh {'paused' if self.paused else 'resumed'}", timeout=2)

    def action_toggle_diag(self):
        self.show_diag = not self.show_diag
        self.diag.display = self.show_diag

    def action_open_streamlit(self):
        exe = shutil.which("streamlit")
        script = "app_bbg.py"
        if not exe or not os.path.exists(script):
            self.notify("Missing Streamlit or app_bbg.py", severity="warning"); return
        try:
            Popen([exe, "run", script], stdout=PIPE, stderr=STDOUT)
            self.notify("Launching Streamlit…", timeout=2)
        except Exception as e:
            self.notify(f"Streamlit launch error: {e}", severity="error")

    def action_refresh(self):
        self.refresh_all()

    # ---------- refresh ----------

    def refresh_all(self):
        try:
            df = load_csv(self.args.csv)
        except Exception as e:
            self.tape.set(f"[red]CSV error:[/red] {e}")
            return

        self.df = df
        close = df["close"].astype(float)
        vol   = df["volume"].astype(float)
        ret   = np.log(close).diff().fillna(0)
        roll  = ret.rolling(24).std().fillna(0)
        peak  = close.cummax()
        dd    = (close / peak - 1).fillna(0)

        # main grid
        self.c_price.set("Price", f"{close.iloc[-1]:.8f}", close.tail(300))
        self.c_vol.set(  "Volume", f"{vol.iloc[-1]:.0f}",  vol.tail(300))
        self.c_vol24.set("Vol (24h)", f"{roll.iloc[-1]:.3f}", roll.tail(300))
        self.c_dd.set(   "Drawdown", f"{dd.iloc[-1]:.6f}",    dd.tail(300))
        self.k_a.set(    "Price (7d)", f"{close.iloc[-1]:.8f}", close.tail(7*24), w=58, h=8)
        self.k_b.set(    "Vol (7d)",   f"{roll.iloc[-1]:.3f}",  roll.tail(7*24),  w=58, h=8)

        # tape
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        self.tape.set(f"[black on #ffb000] NOW {now} [/]   •   CSV: {self.args.csv}")

        # footer help
        self.footer.update(
            "Suggested  FA Fundamentals  •  GP Graph  •  N News  •  "
            "[b]s[/b] Streamlit  [b]d[/b] Diag  [b]p[/b] Pause  [b]r[/b] Refresh  [b]q[/b] Quit"
        )

def parse_args():
    p = argparse.ArgumentParser(description="Noland Prob — TUI Mosaic")
    p.add_argument("--csv", required=True)
    p.add_argument("--model", action="store_true")
    p.add_argument("--horizon-hours", type=int, default=24)
    p.add_argument("--up-mult", type=float, default=1.2)
    p.add_argument("--dn-drop", type=float, default=0.1)
    p.add_argument("--steps", type=int, default=4)
    p.add_argument("--calibration", choices=["isotonic", "sigmoid"], default="isotonic")
    p.add_argument("--dex-query", default="")
    p.add_argument("--dex-address", default="")
    p.add_argument("--tweet-query", default="")
    return p.parse_args()

if __name__ == "__main__":
    args = parse_args()
    app = BBGApp(args)
    app.run()
