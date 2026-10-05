# The parcel example

`parcel.c` is a small shipping-cost program. It parses numbers from text, compares labels, and calculates a cost from a parcel's fields. It also includes a byte checksum so you can compare several different loops in the decompiler.

The source checkout and portable package include `parcel.exe` and `parcel-optimized.exe`, unoptimized and optimized Windows executables built from this file. They contain no debug symbols. Open either one in Ghidra++ and follow the calls from the entry function. Look for the text `Parcel priority delivery`, then inspect the functions that use it. Importing them analyzes the files without running them.

Compare your interpretation with the source after exploring. A model-generated name is a suggestion; the source here lets you check it.

On Linux/macOS, build your own example with `cc -O0 -fno-inline -o parcel parcel.c`, and an optimized version with `cc -O2 -fno-inline -o parcel-optimized parcel.c`. Strip the executables if you want the analysis to start without function names.
