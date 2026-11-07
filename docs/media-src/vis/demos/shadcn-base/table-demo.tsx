import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/styles/base-nova/ui/table"

const invoices = [
  {
    invoice: "INV001",
    paymentStatus: "已付款",
    totalAmount: "$250.00",
    paymentMethod: "信用卡",
  },
  {
    invoice: "INV002",
    paymentStatus: "待处理",
    totalAmount: "$150.00",
    paymentMethod: "PayPal",
  },
  {
    invoice: "INV003",
    paymentStatus: "未付款",
    totalAmount: "$350.00",
    paymentMethod: "银行转账",
  },
  {
    invoice: "INV004",
    paymentStatus: "已付款",
    totalAmount: "$450.00",
    paymentMethod: "信用卡",
  },
  {
    invoice: "INV005",
    paymentStatus: "已付款",
    totalAmount: "$550.00",
    paymentMethod: "PayPal",
  },
  {
    invoice: "INV006",
    paymentStatus: "待处理",
    totalAmount: "$200.00",
    paymentMethod: "银行转账",
  },
  {
    invoice: "INV007",
    paymentStatus: "未付款",
    totalAmount: "$300.00",
    paymentMethod: "信用卡",
  },
]

export function TableDemo() {
  return (
    <Table>
      <TableCaption>查看最近的发票</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">发票</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>方式</TableHead>
          <TableHead className="text-right">金额</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.invoice}>
            <TableCell className="font-medium">{invoice.invoice}</TableCell>
            <TableCell>{invoice.paymentStatus}</TableCell>
            <TableCell>{invoice.paymentMethod}</TableCell>
            <TableCell className="text-right">{invoice.totalAmount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>总计</TableCell>
          <TableCell className="text-right">$2,500.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
