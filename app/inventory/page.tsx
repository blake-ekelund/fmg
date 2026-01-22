"use client";

import { useState } from "react";
import { Stat } from "@/components/sales/Stat";
import { Table } from "@/components/sales/Table";

/* =====================================================
   Inventory Page
===================================================== */

export default function InventoryPage() {
  const [mode, setMode] = useState<"fg" | "bom">("fg");

  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header */}
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          Inventory
        </h1>
        <p className="text-gray-500 max-w-xl">
          Current stock levels across warehouses, vans, and materials.
        </p>

        <p className="text-sm text-gray-400">
          Last updated: July 22, 2026 at 6:15 AM
        </p>

        {/* Inventory Mode Switch */}
        <InventoryModeSwitch mode={mode} setMode={setMode} />
      </header>

      {/* Filters */}
      <FiltersRow />

      {/* Inventory Mode Content */}
      {mode === "fg" ? <FinishedGoodsInventory /> : <BomInventory />}
    </div>
  );
}

/* =====================================================
   Inventory Mode Switch
===================================================== */

function InventoryModeSwitch({
  mode,
  setMode,
}: {
  mode: "fg" | "bom";
  setMode: (m: "fg" | "bom") => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white">
      <button
        onClick={() => setMode("fg")}
        className={`px-3 py-1.5 text-sm rounded-lg transition ${
          mode === "fg"
            ? "bg-gray-100 text-black"
            : "text-gray-500 hover:text-black"
        }`}
      >
        Finished Goods
      </button>
      <button
        onClick={() => setMode("bom")}
        className={`px-3 py-1.5 text-sm rounded-lg transition ${
          mode === "bom"
            ? "bg-gray-100 text-black"
            : "text-gray-500 hover:text-black"
        }`}
      >
        BOM Materials
      </button>
    </div>
  );
}

/* =====================================================
   Filters
===================================================== */

function FiltersRow() {
  return (
    <section className="flex flex-col md:flex-row md:items-center gap-4">
      <input
        type="text"
        placeholder="Search (SKU, Product Name, Fragrance)"
        className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
      />

      <select
        defaultValue=""
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="" disabled>
          Product
        </option>
        <option>Hand Cream</option>
        <option>Body Butter</option>
        <option>Lip Butter</option>
      </select>

      <select
        defaultValue=""
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="" disabled>
          Fragrance
        </option>
        <option>Vanilla</option>
        <option>Coconut</option>
        <option>Lavender</option>
        <option>Citrus</option>
      </select>

      <select
        defaultValue=""
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="" disabled>
          Warehouse
        </option>
        <option>Minneapolis</option>
        <option>Van Fleet</option>
        <option>St. Paul</option>
      </select>
    </section>
  );
}

/* =====================================================
   Finished Goods Inventory
===================================================== */

function FinishedGoodsInventory() {
  return (
    <>
      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="On Hand" value="4,820 units" />
        <Stat label="On Order" value="1,300 units" />
        <Stat label="Available" value="3,920 units" />
        <Stat label="Low Stock SKUs" value="6" />
      </section>

      {/* FG Table */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Finished Goods by Warehouse
        </h2>

        <Table>
          <InventoryRow
            name="Bestie"
            warehouse="Minneapolis"
            onHand="1,120"
            onOrder="300"
            available="920"
            status="healthy"
          />
          <InventoryRow
            name="Bougie Babe"
            warehouse="Van Fleet"
            onHand="840"
            onOrder="500"
            available="480"
            status="watch"
          />
          <InventoryRow
            name="Hot Mess"
            warehouse="St. Paul"
            onHand="420"
            onOrder="0"
            available="120"
            status="critical"
          />
        </Table>
      </section>
    </>
  );
}

/* =====================================================
   BOM Inventory
===================================================== */

function BomInventory() {
  return (
    <>
      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Materials On Hand" value="8,420 units" />
        <Stat label="Allocated to WIP" value="3,200 units" />
        <Stat label="Available" value="5,220 units" />
        <Stat label="Materials at Risk" value="4" />
      </section>

      {/* BOM Table */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          BOM Materials
        </h2>

        <Table>
          <BomRow
            material="Vanilla Fragrance Oil"
            onHand="2,400 ml"
            allocated="1,200 ml"
            available="1,200 ml"
            status="healthy"
          />
          <BomRow
            material="Shea Butter Base"
            onHand="1,800 kg"
            allocated="1,400 kg"
            available="400 kg"
            status="watch"
          />
          <BomRow
            material="12oz Jar Packaging"
            onHand="1,200 units"
            allocated="1,100 units"
            available="100 units"
            status="critical"
          />
        </Table>
      </section>
    </>
  );
}

/* =====================================================
   Rows
===================================================== */

function InventoryRow({
  name,
  warehouse,
  onHand,
  onOrder,
  available,
  status,
}: {
  name: string;
  warehouse: string;
  onHand: string;
  onOrder: string;
  available: string;
  status: "healthy" | "watch" | "critical";
}) {
  return (
    <div className="grid grid-cols-5 gap-4 py-4 items-center">
      <div className="font-medium">{name}</div>
      <div className="text-sm text-gray-500">{warehouse}</div>
      <div className="text-sm">{onHand}</div>
      <div className="text-sm">{onOrder}</div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{available}</span>
        <StatusDot status={status} />
      </div>
    </div>
  );
}

function BomRow({
  material,
  onHand,
  allocated,
  available,
  status,
}: {
  material: string;
  onHand: string;
  allocated: string;
  available: string;
  status: "healthy" | "watch" | "critical";
}) {
  return (
    <div className="grid grid-cols-5 gap-4 py-4 items-center">
      <div className="font-medium">{material}</div>
      <div className="text-sm">{onHand}</div>
      <div className="text-sm">{allocated}</div>
      <div className="text-sm font-medium">{available}</div>
      <StatusDot status={status} />
    </div>
  );
}

function StatusDot({ status }: { status: "healthy" | "watch" | "critical" }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${
        status === "healthy"
          ? "bg-lime-500"
          : status === "watch"
          ? "bg-orange-400"
          : "bg-pink-400"
      }`}
    />
  );
}
