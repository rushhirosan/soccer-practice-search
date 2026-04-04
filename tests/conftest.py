# tests 配下のテストモジュールより先に読み込まれる。
# macOS + 一部環境で NumPy/OpenBLAS が線形代数まわりで SIGFPE するのを抑える（import より前に効かせる）。
import os
import sys

if sys.platform == "darwin":
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
