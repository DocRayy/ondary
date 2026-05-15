import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { effect, inject, Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ICON_DEFINITIONS } from '../../shared/components/fc-icon/icon.constant';
import { HeaderConfig } from '../interfaces/header-config.intercface';

export interface NavigationMenu {
  icon: keyof typeof ICON_DEFINITIONS;
  route: string;
  label: string;
  path: string;
}
@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  isMobileSubject: BehaviorSubject<any> | undefined;
  showNavigation = signal<boolean>(true);
  showNavigationPaths = ['', '/prospect/schedule', '/user/profile', '/customer/list', '/user/list'];

  navigationMenus: NavigationMenu[] = [
    {
      icon: 'home-4-linear',
      label: 'Home',
      route: '.',
      path: '',
    },
    {
      icon: 'users-solid',
      label: 'Customers',
      route: 'customer/list',
      path: '/customer/list',
    },

    {
      icon: 'calendar-linear',
      label: 'Schedule',
      route: 'prospect/schedule',
      path: '/prospect/schedule',
    },

    {
      icon: 'user-circle-linear',
      label: 'Profile',
      route: 'user/profile',
      path: '/user/profile',
    },
  ];

  headerConfigSubject = new BehaviorSubject<HeaderConfig>({
    title: '',
    icon: '',
    showHeader: true,
  });
  searchConfigSubject = new BehaviorSubject<any>({
    showSearch: false,
    searchPlaceholder: '',
    searchQuery: '',
    featureName: '',
  });

  isSidebarActive = signal<boolean>(false);

  updateShowNavigationState(path: string) {
    this.showNavigation.set(this.showNavigationPaths.includes(path));
  }

  openSidebar() {
    this.isSidebarActive.set(true);
  }

  closeSidebar() {
    this.isSidebarActive.set(false);
  }

  toggleSidebarProductList() {
    this.isSidebarActive.update((prev) => !prev);
  }

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.isMobileSubject = new BehaviorSubject(Boolean(this.deviceType == 'mobile'));
    effect(() => {});
  }

  get deviceType(): string {
    if (isPlatformBrowser(this.platformId)) {
      const ua = window.navigator.userAgent;
      if (
        /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
          ua,
        )
      ) {
        return 'mobile';
      }
      return 'desktop';
    } else {
      return '';
    }
  }
  public get isMobile$() {
    return this.isMobileSubject;
  }

  //   getSearchGlobalResult(query: string) {
  //     return this.http.get(`${ROOT_API}/general?q=${query}`);
  //   }

  getPath(fullPath?: string): string {
    const currentUrl = fullPath || this.router.url;

    const urlWithoutQuery = currentUrl.split('?')[0];

    const pathSegments = urlWithoutQuery.split('/').filter((segment) => segment.length > 0);

    if (pathSegments.length === 1) {
      return '';
    }

    if (pathSegments.length > 1) {
      const featurePath = pathSegments.slice(1).join('/');
      return `/${featurePath}`;
    }

    return '';
  }

  setHeaderConfig(config: HeaderConfig) {
    this.headerConfigSubject.next({
      ...this.headerConfigSubject.value,
      ...config,
    });
  }
  setSearchConfig(config: any) {
    this.searchConfigSubject.next({
      ...this.searchConfigSubject.value,
      ...config,
    });
  }

  getRoutes() {
    return [
      {
        route: 'user',
        name: 'User',
        icon: '/assets/icons/employee.svg',
      },
      {
        route: 'customer',
        name: 'Customer',
        icon: '/assets/icons/customer.svg',
      },

      {
        name: 'Campaign',
        showRoutes: false,
        icon: '/assets/icons/campaign.svg',

        subMenus: [
          {
            route: 'campaign/list',
            name: 'Campaign',
            icon: '/assets/icons/list.svg',
          },
          {
            route: 'campaign/activity',
            name: 'Campaign Activity',
            icon: '/assets/icons/campaign-activity.svg',
          },
        ],
      },

      {
        name: 'Lead',
        showRoutes: false,
        icon: '/assets/icons/lead.svg',

        subMenus: [
          {
            route: 'lead/list',
            name: 'Lead',
            icon: '/assets/icons/list.svg',
          },
          {
            route: 'lead/prospect',
            name: 'Prospect',
            icon: '/assets/icons/prospect.svg',
          },
        ],
      },

      {
        name: 'Product',
        showRoutes: false,
        icon: '/assets/icons/parcel.svg',

        subMenus: [
          {
            route: 'product/list',
            name: 'List',
            icon: '/assets/icons/list.svg',
            visible: true,
          },
          {
            route: 'product-request/list',
            name: 'Product Request',
            icon: '/assets/icons/product-request.svg',
            visible: true,
          },
          {
            route: 'product-category/list',
            name: 'Product Category',
            icon: '/assets/icons/product-category.svg',
            visible: true,
          },
          {
            route: 'price-request/list',
            name: 'Price Request',
            icon: '/assets/icons/price-request.svg',
            visible: true,
          },
        ],
      },
      {
        route: 'vendor',
        name: 'Vendor',
        icon: '/assets/icons/vendor.svg',
        visible: true,
      },
      {
        route: 'timelog',
        name: 'Timelog',
        icon: '',
        visible: true,
      },
      {
        route: 'catalog-file',
        name: 'Catalog File',
        icon: '/assets/icons/book.svg',
        visible: true,
      },
      // note: show when feature is ready
      // {
      //   route: 'meeting',
      //   name: 'Meeting',
      // },
      // {
      //   route: 'group',
      //   name: 'Group',
      // },
      // {
      //   route: 'home',
      //   name: 'Home',
      //   icon: '/assets/icons/home.svg',
      //   sequence: 1,
      //   visible: true,
      // },
      {
        route: 'task',
        name: 'My Tasks',
        icon: '',
        sequence: 2,
        visible: true,
      },
      // {
      //   route: 'inbox',
      //   name: 'Inbox',
      //   icon: '/assets/icons/inbox.svg',
      //   sequence: 3,
      //   visible: true,
      // },
    ];
  }
}
