"use client"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/styles/base-rhea/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/styles/base-rhea/ui/drawer"

export function DrawerNested() {
  const isMobile = useIsMobile()

  const swipeDirection = isMobile ? "down" : "right"

  return (
    <Drawer showSwipeHandle={isMobile} swipeDirection={swipeDirection}>
      <DrawerTrigger render={<Button variant="secondary" />}>
        打开抽屉
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>抽屉</DrawerTitle>
          <DrawerDescription>
            从相同方向再打开一个抽屉。
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 p-4">
          <div className="bg-muted group-data-[swipe-axis=x]/drawer-popup:size-full group-data-[swipe-axis=y]/drawer-popup:aspect-video group-data-[swipe-axis=y]/drawer-popup:w-full" />
        </div>
        <DrawerFooter>
          <Drawer showSwipeHandle={isMobile} swipeDirection={swipeDirection}>
            <DrawerTrigger render={<Button variant="outline" />}>
              打开嵌套抽屉
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>嵌套抽屉</DrawerTitle>
                <DrawerDescription>
                  父级抽屉仍挂载在当前抽屉后方。
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 p-4">
                <div className="bg-muted group-data-[swipe-axis=x]/drawer-popup:size-full group-data-[swipe-axis=y]/drawer-popup:aspect-video group-data-[swipe-axis=y]/drawer-popup:w-full" />
              </div>
              <DrawerFooter>
                <Drawer
                  showSwipeHandle={isMobile}
                  swipeDirection={swipeDirection}
                >
                  <DrawerTrigger render={<Button variant="outline" />}>
                    打开第三层抽屉
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>第三层抽屉</DrawerTitle>
                      <DrawerDescription>
                        当前抽屉后方还堆叠着两层抽屉。
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="flex-1 p-4">
                      <div className="bg-muted group-data-[swipe-axis=x]/drawer-popup:size-full group-data-[swipe-axis=y]/drawer-popup:aspect-video group-data-[swipe-axis=y]/drawer-popup:w-full" />
                    </div>
                    <DrawerFooter>
                      <Drawer
                        showSwipeHandle={isMobile}
                        swipeDirection={swipeDirection}
                      >
                        <DrawerTrigger render={<Button variant="outline" />}>
                          打开第四层抽屉
                        </DrawerTrigger>
                        <DrawerContent>
                          <DrawerHeader>
                            <DrawerTitle>第四层抽屉</DrawerTitle>
                            <DrawerDescription>
                              这是抽屉堆叠中最前方的一层。
                            </DrawerDescription>
                          </DrawerHeader>
                          <div className="flex-1 p-4">
                            <div className="bg-muted group-data-[swipe-axis=x]/drawer-popup:size-full group-data-[swipe-axis=y]/drawer-popup:aspect-video group-data-[swipe-axis=y]/drawer-popup:w-full" />
                          </div>
                          <DrawerFooter>
                            <DrawerClose render={<Button variant="outline" />}>
                              关闭
                            </DrawerClose>
                          </DrawerFooter>
                        </DrawerContent>
                      </Drawer>
                      <DrawerClose render={<Button variant="outline" />}>
                        关闭
                      </DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
                <DrawerClose render={<Button variant="outline" />}>
                  关闭
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <DrawerClose render={<Button variant="outline" />}>关闭</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
