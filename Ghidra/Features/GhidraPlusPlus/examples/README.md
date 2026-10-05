# The parcel example

`parcel.c` is a small shipping-cost program. It parses numbers from text, compares labels, and calculates a cost from a parcel's fields. It also includes a byte checksum so you can compare several different loops in the decompiler.

The source checkout and portable package include `parcel.exe` and `parcel-optimized.exe`, unoptimized and optimized Windows executables built from this file. They contain no debug symbols. The welcome screen's **Try the example** button opens `parcel.exe`; you can also open either file yourself. Start from the function marked **Start**, look for the text `Parcel priority delivery`, then inspect the functions that use it. Opening them analyzes the files without running them.

Compare your interpretation with the source after exploring. A model-generated name is a suggestion; the source here lets you check it.

On Linux/macOS, build your own example with `cc -O0 -fno-inline -o parcel parcel.c`, and an optimized version with `cc -O2 -fno-inline -o parcel-optimized parcel.c`. Strip the executables if you want the analysis to start without function names.
