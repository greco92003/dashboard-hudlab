"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  getPaginationRowModel,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination?: boolean;
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

/** Coluna com meta.sticky fica presa à esquerda ao rolar a tabela para o lado. */
function isSticky(meta: unknown) {
  return Boolean((meta as { sticky?: boolean } | undefined)?.sticky);
}

// A sombra de 1px marca onde a coluna fixa termina; borda some no sticky.
const STICKY_CLASS =
  "sticky left-0 z-10 bg-background shadow-[1px_0_0_0_var(--border)]";

/**
 * Barra de rolagem lateral também em cima da tabela, sincronizada com a de
 * baixo: em tabela longa a de baixo só aparecia depois de descer tudo.
 */
function useTopScrollbar() {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setScrollWidth(body.scrollWidth);
      setOverflowing(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const top = topRef.current;
    const body = bodyRef.current;
    if (!top || !body) return;
    const fromTop = () => {
      if (body.scrollLeft !== top.scrollLeft) body.scrollLeft = top.scrollLeft;
    };
    const fromBody = () => {
      if (top.scrollLeft !== body.scrollLeft) top.scrollLeft = body.scrollLeft;
    };
    top.addEventListener("scroll", fromTop, { passive: true });
    body.addEventListener("scroll", fromBody, { passive: true });
    return () => {
      top.removeEventListener("scroll", fromTop);
      body.removeEventListener("scroll", fromBody);
    };
  }, [overflowing]);

  return { topRef, bodyRef, scrollWidth, overflowing };
}

function visiblePages(
  pageIndex: number,
  pageCount: number,
): Array<number | "ellipsis"> {
  if (pageCount <= 7)
    return Array.from({ length: pageCount }, (_, index) => index);
  const candidates = new Set([
    0,
    pageCount - 1,
    pageIndex - 1,
    pageIndex,
    pageIndex + 1,
  ]);
  const sorted = [...candidates]
    .filter((page) => page >= 0 && page < pageCount)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pagination = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50],
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: pagination
      ? { pagination: { pageIndex: 0, pageSize: initialPageSize } }
      : undefined,
    state: {
      sorting,
    },
  });

  const { topRef, bodyRef, scrollWidth, overflowing } = useTopScrollbar();
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-hidden">
        {overflowing ? (
          <div
            ref={topRef}
            className="overflow-x-auto border-b"
            aria-hidden="true"
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
        ) : null}
        <div ref={bodyRef} className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          isSticky(header.column.columnDef.meta) && STICKY_CLASS,
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          isSticky(cell.column.columnDef.meta) && STICKY_CLASS,
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    Nenhum resultado encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {pagination && data.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Linhas por página</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger
                className="h-8 w-[76px]"
                aria-label="Linhas por página"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {pageIndex * table.getState().pagination.pageSize + 1}–
              {Math.min(
                (pageIndex + 1) * table.getState().pagination.pageSize,
                data.length,
              )}{" "}
              de {data.length}
            </span>
          </div>
          <Pagination className="mx-0 w-auto justify-start sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  type="button"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                />
              </PaginationItem>
              {visiblePages(pageIndex, pageCount).map((page, index) =>
                page === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${index}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={page} className="hidden sm:block">
                    <PaginationLink
                      type="button"
                      isActive={page === pageIndex}
                      aria-label={`Ir para a página ${page + 1}`}
                      onClick={() => table.setPageIndex(page)}
                    >
                      {page + 1}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  type="button"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
