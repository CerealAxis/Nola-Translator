import { GenerativePreview } from "../../assistant-ui/late/generative-preview"

// #region spec
const spec = {
  "$type": "Card",
  "children": [
    {
      "$type": "Image",
      "$key": "cover",
      "src": "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=640&q=80",
      "alt": "挂着吉他、亮着暖色灯光的录音室和调音台"
    },
    {
      "$type": "Divider",
      "$key": "divider"
    },
    {
      "$type": "Header",
      "$key": "title",
      "text": "专注时光",
      "size": "md"
    },
    {
      "$type": "ListView",
      "$key": "tracks",
      "children": [
        {
          "$type": "ListViewItem",
          "$key": "t1",
          "$action": {
            "type": "play_track",
            "trackId": "t1"
          },
          "children": {
            "$type": "Row",
            "align": "center",
            "gap": 3,
            "children": [
              {
                "$type": "Text",
                "$key": "n",
                "value": "1",
                "size": "sm",
                "color": "secondary"
              },
              {
                "$type": "Image",
                "$key": "thumb",
                "src": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=640&q=80",
                "alt": "",
                "size": "sm",
                "round": true
              },
              {
                "$type": "Col",
                "$key": "info",
                "gap": 0,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "晨光",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "artist",
                    "value": "阿莉娅·索尔"
                  }
                ]
              },
              {
                "$type": "Spacer",
                "$key": "spacer"
              },
              {
                "$type": "Button",
                "$key": "play",
                "label": "播放",
                "buttonStyle": "ghost",
                "$action": {
                  "type": "play_track",
                  "trackId": "t1"
                },
                "children": {
                  "$type": "Icon",
                  "name": "play",
                  "size": "sm"
                }
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "t2",
          "$action": {
            "type": "play_track",
            "trackId": "t2"
          },
          "children": {
            "$type": "Row",
            "align": "center",
            "gap": 3,
            "children": [
              {
                "$type": "Text",
                "$key": "n",
                "value": "2",
                "size": "sm",
                "color": "secondary"
              },
              {
                "$type": "Image",
                "$key": "thumb",
                "src": "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?w=640&q=80",
                "alt": "",
                "size": "sm",
                "round": true
              },
              {
                "$type": "Col",
                "$key": "info",
                "gap": 0,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "微弱电流",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "artist",
                    "value": "田野笔记"
                  }
                ]
              },
              {
                "$type": "Spacer",
                "$key": "spacer"
              },
              {
                "$type": "Button",
                "$key": "play",
                "label": "播放",
                "buttonStyle": "ghost",
                "$action": {
                  "type": "play_track",
                  "trackId": "t2"
                },
                "children": {
                  "$type": "Icon",
                  "name": "play",
                  "size": "sm"
                }
              }
            ]
          }
        },
        {
          "$type": "ListViewItem",
          "$key": "t3",
          "$action": {
            "type": "play_track",
            "trackId": "t3"
          },
          "children": {
            "$type": "Row",
            "align": "center",
            "gap": 3,
            "children": [
              {
                "$type": "Text",
                "$key": "n",
                "value": "3",
                "size": "sm",
                "color": "secondary"
              },
              {
                "$type": "Image",
                "$key": "thumb",
                "src": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=640&q=80",
                "alt": "",
                "size": "sm",
                "round": true
              },
              {
                "$type": "Col",
                "$key": "info",
                "gap": 0,
                "children": [
                  {
                    "$type": "Text",
                    "$key": "title",
                    "value": "琥珀时刻",
                    "weight": "medium"
                  },
                  {
                    "$type": "Caption",
                    "$key": "artist",
                    "value": "阿莉娅·索尔"
                  }
                ]
              },
              {
                "$type": "Spacer",
                "$key": "spacer"
              },
              {
                "$type": "Button",
                "$key": "play",
                "label": "播放",
                "buttonStyle": "ghost",
                "$action": {
                  "type": "play_track",
                  "trackId": "t3"
                },
                "children": {
                  "$type": "Icon",
                  "name": "play",
                  "size": "sm"
                }
              }
            ]
          }
        }
      ]
    },
    {
      "$type": "Button",
      "$key": "view-all",
      "label": "查看播放列表",
      "buttonStyle": "outline",
      "block": true,
      "$action": {
        "type": "view_playlist"
      }
    }
  ]
}
// #endregion spec

export default function Demo() {
  return <GenerativePreview spec={spec} />
}
